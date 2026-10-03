import { z } from "zod";

export const assumptionItemSchema = z.object({
  assumption: z.string(),
  fatal: z.boolean(),
  test: z.string(),
  successMetric: z.string(),
  days: z.number(),
  costIdr: z.number(),
});

export const marketRangeSchema = z.object({
  tam: z.string(),
  sam: z.string(),
  som: z.string(),
  assumptions: z.string(),
});

export const sectionDraftSchema = z.object({
  body: z.string(),
  rationale: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  citations: z.array(z.number().int().positive()),
  market: marketRangeSchema.nullable(),
  assumptions: z.array(assumptionItemSchema),
});

export type SectionDraft = z.infer<typeof sectionDraftSchema>;
export type AssumptionItem = z.infer<typeof assumptionItemSchema>;
