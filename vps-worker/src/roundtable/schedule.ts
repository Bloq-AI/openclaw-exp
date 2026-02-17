interface ScheduleSlot {
  format: string;
  probability: number;
}

/**
 * 24-hour schedule mapping each hour to a roundtable format with probability.
 * Hours not listed have no scheduled roundtable.
 */
const schedule: Record<number, ScheduleSlot> = {
  8: { format: "standup", probability: 0.8 },
  9: { format: "standup", probability: 1.0 },
  10: { format: "debate", probability: 0.4 },
  11: { format: "watercooler", probability: 0.3 },
  12: { format: "watercooler", probability: 0.5 },
  13: { format: "debate", probability: 0.5 },
  14: { format: "debate", probability: 0.6 },
  15: { format: "standup", probability: 0.4 },
  16: { format: "watercooler", probability: 0.4 },
  17: { format: "debate", probability: 0.3 },
  18: { format: "standup", probability: 0.6 },
  19: { format: "watercooler", probability: 0.3 },
  20: { format: "debate", probability: 0.4 },
  21: { format: "watercooler", probability: 0.4 },
  22: { format: "watercooler", probability: 0.2 },
};

export function getSlotForHour(hour: number): ScheduleSlot | null {
  return schedule[hour] ?? null;
}
