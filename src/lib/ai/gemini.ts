import "server-only";

import { MODELS, type ModelTier } from "./models";
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
  candidates?: { content?: { parts?: GeminiPart[]; role?: string } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
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
    const res = await fetch(`${API_BASE}/${spec.id}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

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
  } catch {
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
    },
    apiKey
  );
  if (!result) return null;
  return { parts: result.parts, text: result.text };
}
