import "server-only";

import { MODELS, type ModelTier, type ThinkingLevel } from "./models";
import { recordUsage, withinBudget } from "./usage";

// The one door to the model, per SPEC.md Part F ("all AI calls go through ONE
// server-side route/utility"). Every feature — receipt vision, CSV
// categorisation, the assistant, briefings — builds its own prompt and comes
// through here, which is what makes three things true at once:
//
//   - the API key never leaves the server;
//   - every call is metered into ai_usage, so the cost screen is real
//     rather than an estimate;
//   - the monthly budget is enforced in one place instead of five.
//
// Model ids and prices live in models.ts. This file only ever names a *tier*.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Long enough for a deep call with thinking, short enough that a hung request
// cannot hold a page render open. See the fetch below.
const REQUEST_TIMEOUT_MS = 30_000;

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// ---------------------------------------------------------------------------
// Shared wire types
// ---------------------------------------------------------------------------

/** A Gemini function-calling parameter schema (an OpenAPI subset). */
export interface ToolParameterSchema {
  type: "OBJECT" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY";
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  items?: ToolParameterSchema;
  enum?: string[];
  required?: string[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[]; role?: string }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /**
     * Private reasoning tokens. Reported SEPARATELY — they are not included in
     * candidatesTokenCount — but billed at the output rate. Counting only
     * candidatesTokenCount under-reports the bill by up to 50x, which would
     * make the monthly ceiling in usage.ts unenforceable. See models.ts.
     */
    thoughtsTokenCount?: number;
    /** Google's own total. Used as a cross-check that we are counting everything. */
    totalTokenCount?: number;
  };
}

// ---------------------------------------------------------------------------
// The raw call
// ---------------------------------------------------------------------------

interface RawCallParams {
  feature: string;
  tier: ModelTier;
  systemPrompt: string;
  contents: GeminiContent[];
  tools?: FunctionDeclaration[];
  jsonOnly?: boolean;
  maxOutputTokens?: number;
  /** Overrides the tier's default thinking level. */
  thinking?: ThinkingLevel;
}

interface RawCallResult {
  parts: GeminiPart[];
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function rawCall(params: RawCallParams, apiKey: string): Promise<RawCallResult | null> {
  const spec = MODELS[params.tier];

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: params.systemPrompt }] },
    contents: params.contents,
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens ?? 1024,
      // Cost control, and the reason small output caps still work. Thinking
      // tokens bill at the output rate AND consume maxOutputTokens, so leaving
      // this unset lets the model spend the whole allowance reasoning and
      // return nothing. Never remove this without raising every caller's cap.
      thinkingConfig: { thinkingLevel: params.thinking ?? spec.thinking },
      // Tool calling and forced-JSON output are mutually exclusive on the
      // Gemini API: asking for both makes the model answer with JSON *about*
      // the tool instead of calling it.
      ...(params.jsonOnly && !params.tools ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (params.tools?.length) {
    body.tools = [{ function_declarations: params.tools }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }

  try {
    // The key goes in a HEADER, never the query string. As `?key=` it was
    // written into every proxy and platform access log that records URLs.
    //
    // The timeout is the other half: there was none, so a hung Google request
    // held the caller until the platform gave up 300s later — and the Today
    // page awaits one of these during render, which meant a blank screen.
    const res = await fetch(`${API_BASE}/${spec.id}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Logged, not swallowed. Every caller treats null as "let the person do
      // it by hand", which is the right fallback but leaves no trace — a dead
      // model id or a spent quota looks exactly like a feature that was never
      // switched on. This line is the only way to tell those apart.
      console.error(
        `[ai] ${params.feature} ${spec.id} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    // Thoughts are billed as output, so they are metered as output. See the
    // note on thoughtsTokenCount above.
    const outputTokens =
      (data.usageMetadata?.candidatesTokenCount ?? 0) +
      (data.usageMetadata?.thoughtsTokenCount ?? 0);

    // The check that would have caught the thinking-token gap on day one
    // instead of after a 50x under-count: the API also reports its own
    // totalTokenCount, and if our idea of the bill drifts below it, we are
    // failing to count a category of token that Google is counting. A small
    // tolerance absorbs rounding and any metadata Google includes in the total
    // but does not bill. Logged, never thrown — a mis-metered call is still a
    // call the person should get the benefit of.
    const reportedTotal = data.usageMetadata?.totalTokenCount ?? 0;
    const counted = inputTokens + outputTokens;
    if (reportedTotal > 0 && Math.abs(counted - reportedTotal) > 8) {
      // BOTH directions matter, and they fail differently. Counting too FEW
      // means a billed category is going unmetered — the 50x under-count this
      // check was written for. Counting too MANY would happen if Google ever
      // folded thoughts into candidatesTokenCount, since this code adds them
      // separately; that would double-count and lock Alan out of every AI
      // feature at a fraction of his real spend, which is the more annoying
      // failure because everything would simply stop working.
      console.error(
        `[ai] ${params.feature} token accounting drift: counted ${counted} but the API ` +
          `reported ${reportedTotal}. ${
            counted < reportedTotal
              ? "A billed token category is going uncounted — check usageMetadata for a new field."
              : "Tokens are being counted twice — check whether thoughts are now inside candidatesTokenCount."
          }`
      );
    }

    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error(
        `[ai] ${params.feature} hit maxOutputTokens (${params.maxOutputTokens ?? 1024}); ` +
          `raise the cap or lower the thinking level.`
      );
    }

    // Metered whatever the answer turns out to be: a call that produced a
    // useless response still cost money, and a meter that only counts the
    // successes understates the bill.
    await recordUsage({
      feature: params.feature,
      tier: params.tier,
      modelId: spec.id,
      inputTokens,
      outputTokens,
    });

    return {
      parts,
      text: parts.map((p) => p.text ?? "").join(""),
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    // Logged, not silently swallowed. The HTTP branch above already explains
    // why: a dead model and a feature that was never switched on look
    // identical from the outside, and this branch is where a timeout or a
    // network failure lands.
    console.error(
      `[ai] ${params.feature} ${spec.id} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// The two shapes every feature needs
// ---------------------------------------------------------------------------

export interface JsonCallParams {
  /** Short slug recorded against the spend, e.g. "receipt" or "assistant". */
  feature: string;
  tier?: ModelTier;
  systemPrompt: string;
  userText?: string;
  imageBase64?: string;
  imageMimeType?: string;
  maxOutputTokens?: number;
  /** Overrides the tier's default thinking level (see models.ts). */
  thinking?: ThinkingLevel;
}

/**
 * One-shot, JSON in / JSON out. Returns null — never throws — when AI isn't
 * configured, the budget is spent, or the model didn't produce usable JSON.
 * SPEC.md Part F: "on parse failure, retry once then fail gracefully to manual
 * entry", so every caller treats null as "let the person do it by hand".
 */
export async function callGeminiJson(params: JsonCallParams): Promise<unknown | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!(await withinBudget())) return null;

  const parts: GeminiPart[] = [];
  if (params.userText) parts.push({ text: params.userText });
  if (params.imageBase64) {
    parts.push({
      inline_data: {
        mime_type: params.imageMimeType ?? "image/jpeg",
        data: params.imageBase64,
      },
    });
  }

  const call = () =>
    rawCall(
      {
        feature: params.feature,
        tier: params.tier ?? "standard",
        systemPrompt: params.systemPrompt,
        contents: [{ role: "user", parts }],
        jsonOnly: true,
        maxOutputTokens: params.maxOutputTokens,
        thinking: params.thinking,
      },
      apiKey
    );

  // One retry, then give up — a second failure is a bad prompt or a bad photo,
  // not bad luck, and a third attempt would just be a third charge.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await call();
    if (!result?.text) continue;
    try {
      return JSON.parse(result.text);
    } catch {
      // Fall through to the retry.
    }
  }
  return null;
}

export interface ToolCallParams {
  feature: string;
  tier?: ModelTier;
  systemPrompt: string;
  contents: GeminiContent[];
  tools: FunctionDeclaration[];
  maxOutputTokens?: number;
  /** Overrides the tier's default thinking level (see models.ts). */
  thinking?: ThinkingLevel;
}

export interface ToolCallResult {
  parts: GeminiPart[];
  text: string;
}

/**
 * One turn of a tool-using conversation: the caller owns the loop, feeds tool
 * results back in as new `contents`, and decides when to stop. See
 * `assistant.ts` for the loop this is built for.
 */
export async function callGeminiWithTools(params: ToolCallParams): Promise<ToolCallResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!(await withinBudget())) return null;

  const result = await rawCall(
    {
      feature: params.feature,
      tier: params.tier ?? "standard",
      systemPrompt: params.systemPrompt,
      contents: params.contents,
      tools: params.tools,
      maxOutputTokens: params.maxOutputTokens ?? 2048,
      thinking: params.thinking,
    },
    apiKey
  );
  if (!result) return null;
  return { parts: result.parts, text: result.text };
}
