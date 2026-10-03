export const PIPELINE_VERSION = "v8";

export const SECTION_KEYS = [
  "summary",
  "problem",
  "customer",
  "market",
  "competition",
  "businessModel",
  "gtm",
  "risk",
  "assumptions",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Weights for scored sections. Summary carries the overall score, not its own weight. */
export const SECTION_WEIGHTS: Record<Exclude<SectionKey, "summary">, number> = {
  problem: 0.14,
  customer: 0.12,
  market: 0.14,
  competition: 0.16,
  businessModel: 0.14,
  gtm: 0.1,
  risk: 0.1,
  assumptions: 0.1,
};

export const UNGROUNDED_SCORE_CAP = 45;
