import { z } from "zod";

export const chatChangeSchema = z.object({
  sectionKey: z.string(),
  label: z.string(),
  before: z.string(),
  after: z.string(),
  scoreBefore: z.number().nullable(),
  scoreAfter: z.number().nullable(),
});

export const scoreAdjustmentSchema = z.object({
  sectionKey: z.string(),
  scoreAfter: z.number().min(0).max(100),
});

export const chatReplySchema = z.object({
  kind: z.enum(["followup", "whatif"]),
  answer: z.string(),
  changes: z.array(chatChangeSchema),
  scoreAdjustments: z.array(scoreAdjustmentSchema),
});

export type ChatReply = z.infer<typeof chatReplySchema>;
export type ChatChange = z.infer<typeof chatChangeSchema>;
