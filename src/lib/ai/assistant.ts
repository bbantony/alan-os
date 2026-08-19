import "server-only";

import { todayInAppTimezone, formatInAppTimezone } from "@/lib/time";
import type { ModuleAccess } from "@/lib/permissions";
import { callGeminiWithTools, isAiConfigured, type GeminiContent, type GeminiPart } from "./gemini";
import { declarationsFor, toolsFor, type AiTool, type ToolContext } from "./tools";
import { getUsageSummary } from "./usage";

/**
 * The assistant loop.
 *
 * Ask a question, and the model is handed a set of tools it may call to find
 * out — the tools do the reading and writing against the database under the
 * person's own session, the results go back to the model, and it answers from
 * what it actually found. It is never asked to remember or invent the data.
 *
 * HOW THIS STAYS CHEAP, which was the explicit worry. Three limits, all hard:
 *
 *   - MAX_STEPS caps a single question at four model calls, so a confused
 *     loop costs four calls, not four hundred;
 *   - the conversation sent each turn is trimmed to the last MAX_HISTORY
 *     messages, so a long chat doesn't re-send its whole history at the input
 *     price every single turn;
 *   - the monthly budget in usage.ts is checked inside `callGeminiWithTools`
 *     itself, so nothing here can route around it.
 */

const MAX_STEPS = 4;
const MAX_HISTORY = 12;

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  /** Names of the writes performed while answering, for the "what I did" line. */
  actions?: string[];
}

export interface AssistantReply {
  text: string;
  actions: string[];
  /** Set when nothing could be done — a missing key, or the budget being spent. */
  unavailable?: string;
}

function systemPrompt(displayName: string | null, access: ModuleAccess): string {
  const now = new Date();
  const modules = Object.entries(access)
    .filter(([, allowed]) => allowed)
    .map(([id]) => id)
    .join(", ");

  return `You are the assistant inside Alan OS, a personal life-management app${
    displayName ? ` belonging to ${displayName}` : ""
  }.

Today is ${formatInAppTimezone(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (${todayInAppTimezone()}), in Winnipeg, Canada. Money is Canadian dollars.

The modules this person can use: ${modules || "none"}.

HOW TO WORK
- Use the tools to find things out. Never guess a number, a balance, a date or
  a task title — if a tool can tell you, call it. If no tool can, say so plainly.
- Prefer one broad call over several narrow ones. get_money_overview answers
  most money questions on its own.
- When asked for a report or a summary, gather the data first, then write it
  as short prose with a few clear figures. Markdown headings and bullet lists
  are fine. Never invent a figure to round out a summary.
- Before writing anything (adding a task, logging an expense, adding to the
  shopping list), only act when the person has clearly asked for it. If the
  amount, the date or which account is genuinely unclear, ask one short
  question instead of guessing.
- After doing something, say what you did in one line.

HOW TO SPEAK
- Plain English. Short sentences. No jargon, no technical terms, no
  apologising, no talking about tools or the database or yourself.
- Answer the question that was asked, then stop. Don't offer a menu of things
  you could do next unless asked.
- If something is empty ("no transactions this month"), say that clearly
  rather than filling the space.`;
}

async function runTool(
  tool: AiTool,
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    return await tool.run(ctx, args);
  } catch (error) {
    // A broken tool must not take the conversation down with it — the model
    // gets told it failed and can say so or try another way.
    return { error: error instanceof Error ? error.message : "That didn't work." };
  }
}

export async function askAssistant(input: {
  ctx: ToolContext;
  displayName: string | null;
  moduleAccess: ModuleAccess;
  history: AssistantMessage[];
  question: string;
}): Promise<AssistantReply> {
  if (!isAiConfigured()) {
    return {
      text: "",
      actions: [],
      unavailable:
        "The assistant needs a Google AI key before it can do anything. It's free — see the Manual's Phase 5 section for the five steps.",
    };
  }

  const usage = await getUsageSummary();
  if (usage.overBudget) {
    return {
      text: "",
      actions: [],
      unavailable: `This month's AI budget (${usage.label}) is used up. It resets on the 1st. Everything else in the app works as normal.`,
    };
  }

  const tools = toolsFor(input.moduleAccess);
  const declarations = declarationsFor(tools);
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const contents: GeminiContent[] = [
    ...input.history.slice(-MAX_HISTORY).map<GeminiContent>((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: input.question }] },
  ];

  const actions: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callGeminiWithTools({
      feature: "assistant",
      tier: "standard",
      systemPrompt: systemPrompt(input.displayName, input.moduleAccess),
      contents,
      tools: declarations,
    });

    if (!reply) {
      return {
        text: "",
        actions,
        unavailable: "The assistant couldn't be reached just now. Try again in a moment.",
      };
    }

    const calls = reply.parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      const text = reply.text.trim();
      return {
        text: text || "I couldn't work that one out. Try asking it a different way.",
        actions,
      };
    }

    // Record the model's turn verbatim, then answer every call it made in one
    // user turn — the shape the API expects.
    contents.push({ role: "model", parts: reply.parts });

    const responseParts: GeminiPart[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      const tool = toolByName.get(call.name);
      if (!tool) {
        responseParts.push({
          functionResponse: { name: call.name, response: { error: "No such tool." } },
        });
        continue;
      }
      const result = await runTool(tool, input.ctx, call.args ?? {});
      if (tool.writes && !(result as { error?: string })?.error) {
        actions.push(tool.name);
      }
      responseParts.push({
        functionResponse: { name: call.name, response: { result } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Ran out of steps. Better to say so than to keep spending.
  return {
    text: "That turned into more digging than I can do in one go. Try asking for one thing at a time.",
    actions,
  };
}
