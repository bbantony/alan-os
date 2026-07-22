import "server-only";

// One shared low-level call, per SPEC.md Part F ("all AI calls go through ONE
// server-side route/utility"). Every feature (receipt vision, CSV
// categorization) builds its own system prompt and calls this.
//
// Model choice: gemini-2.5-flash — Google's current cheap multimodal model
// with JSON mode (gemini-2.0-flash was retired June 2026). If this ever
// starts returning errors, check ai.google.dev/api/models for the current
// recommended flash-tier model name and update GEMINI_MODEL below; nothing
// else needs to change.
const GEMINI_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiCallParams {
  systemPrompt: string;
  userText?: string;
  imageBase64?: string;
  imageMimeType?: string;
  maxOutputTokens?: number;
}

async function attemptCall(params: GeminiCallParams, apiKey: string): Promise<unknown | null> {
  const parts: Record<string, unknown>[] = [];
  if (params.userText) parts.push({ text: params.userText });
  if (params.imageBase64) {
    parts.push({ inline_data: { mime_type: params.imageMimeType ?? "image/jpeg", data: params.imageBase64 } });
  }

  try {
    const res = await fetch(`${API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: params.maxOutputTokens ?? 1024,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// SPEC.md Part F: "on parse failure, retry once then fail gracefully to
// manual entry" — callers treat a null return as "AI unavailable, let the
// owner fill it in by hand," never as an error to surface.
export async function callGeminiJson(params: GeminiCallParams): Promise<unknown | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const first = await attemptCall(params, apiKey);
  if (first !== null) return first;
  return attemptCall(params, apiKey);
}
