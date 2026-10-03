import { parsedCompletion } from "../llm.js";
import { smallModel, smallModelName } from "../providers/openai.js";
import { SECTION_KEYS, type SectionKey } from "../constants.js";
import { applyGroundingCap, clampScore } from "../scoring.js";
import { z } from "zod";
import type { GeneratedSection } from "./generate-section.js";
import type { NormalizedIdea } from "../schemas/normalized-idea.js";
import { formatIdea } from "./research.js";

const criticSchema = z.object({
  notes: z.string(),
  adjustments: z.array(
    z.object({
      sectionKey: z.string(),
      scoreAfter: z.number().min(0).max(100),
      reason: z.string(),
    }),
  ),
});

function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export async function critiqueSections(
  idea: NormalizedIdea,
  sections: GeneratedSection[],
): Promise<GeneratedSection[]> {
  const excerpt = sections
    .map(
      (section) =>
        `${section.key} score=${section.score} grounded=${section.grounded}: ${section.content.body.slice(0, 320)}`,
    )
    .join("\n\n");

  try {
    const critique = await parsedCompletion(
      "critic-report",
      smallModel,
      smallModelName,
      criticSchema,
      {
        temperature: 0.1,
        instructions: `You are a harsh critic of a startup validation memo.
Lower scores that cheerlead, invent competitors/prices, or ignore incumbents.
Keep clones of national consumer apps (Gojek, Instagram, Tokopedia) and vague all-in-one AI below 55 overall.
For a specific Indonesian B2B niche (named buyer, real Rp price, numeric segment), raise problem/customer toward 60–68 if they were scored below 58, and do not leave overall below 55 unless illegal or fraudulent.
Only return adjustments for sections that should change. Empty adjustments if the memo is already skeptical.
Do not raise scores above 75 without extraordinary evidence.`,
        input: [formatIdea(idea), excerpt].join("\n\n"),
      },
    );

    if (critique.adjustments.length === 0) return sections;

    const byKey = new Map(
      critique.adjustments.map((item) => [item.sectionKey, item]),
    );

    return sections.map((section) => {
      const adjustment = byKey.get(section.key);
      if (!adjustment || !isSectionKey(section.key)) return section;
      const score = applyGroundingCap(
        section.key,
        clampScore(adjustment.scoreAfter),
        section.grounded,
      );
      return {
        ...section,
        score,
        content: {
          ...section.content,
          rationale: [section.content.rationale, adjustment.reason]
            .filter(Boolean)
            .join(" "),
        },
      };
    });
  } catch {
    return sections;
  }
}
