import { z } from "zod";

export const normalizedIdeaSchema = z.object({
  accepted: z.boolean(),
  rejectReason: z.string(),
  oneLiner: z.string(),
  problem: z.string(),
  solution: z.string(),
  customer: z.string(),
  monetization: z.string(),
  region: z.string(),
  stage: z.string(),
  language: z.enum(["id", "en"]),
  clarityScore: z.number().min(0).max(1),
});

export type NormalizedIdea = z.infer<typeof normalizedIdeaSchema>;
