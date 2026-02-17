import { Agent } from "./agents";
import { FormatConfig } from "./formats";

interface Turn {
  agent_id: string;
  message: string;
}

export function buildSystemPrompt(
  agent: Agent,
  format: FormatConfig,
  history: Turn[],
  charCap: number,
  modifiers?: string[]
): string {
  let prompt = `${agent.systemDirective}

You are ${agent.displayName}. Your tone is ${agent.tone}. ${agent.quirk}.

FORMAT: ${format.name} — ${format.description}

RULES:
- Keep your response under ${charCap} characters. This is a hard limit.
- Be direct and punchy. No filler.
- Stay in character.
- Build on what others said. Don't repeat points.`;

  if (modifiers && modifiers.length > 0) {
    prompt += `\n\nPersonality evolution:\n${modifiers.map((m) => `- ${m}`).join("\n")}`;
  }

  if (history.length > 0) {
    prompt += "\n\nConversation so far:";
    for (const turn of history) {
      prompt += `\n[${turn.agent_id}]: ${turn.message}`;
    }
  }

  prompt += `\n\nRespond as ${agent.displayName}. Under ${charCap} chars. No quotation marks around your response.`;

  return prompt;
}
