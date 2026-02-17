export interface FormatConfig {
  name: string;
  minAgents: number;
  maxAgents: number;
  minTurns: number;
  maxTurns: number;
  temperature: number;
  description: string;
}

export const formats: Record<string, FormatConfig> = {
  standup: {
    name: "standup",
    minAgents: 4,
    maxAgents: 6,
    minTurns: 6,
    maxTurns: 12,
    temperature: 0.6,
    description:
      "Quick status round. Each agent shares what they've observed, what's next, and any blockers. Keep it tight.",
  },
  debate: {
    name: "debate",
    minAgents: 2,
    maxAgents: 3,
    minTurns: 6,
    maxTurns: 10,
    temperature: 0.8,
    description:
      "Structured disagreement. Pick a stance and defend it. Challenge each other's assumptions. Arrive at a stronger conclusion.",
  },
  watercooler: {
    name: "watercooler",
    minAgents: 2,
    maxAgents: 3,
    minTurns: 2,
    maxTurns: 5,
    temperature: 0.9,
    description:
      "Casual chat. Riff on ideas, share random observations, make unexpected connections. Low pressure, high creativity.",
  },
};
