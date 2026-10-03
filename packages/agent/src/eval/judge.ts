import { parsedCompletion } from "../llm.js";
import { smallModel, smallModelName } from "../providers/openai.js";
import { z } from "zod";
import type { EvalReportSnapshot } from "./checks.js";

export const judgeSchema = z.object({
  specificity: z.number().min(1).max(5),
  skepticism: z.number().min(1).max(5),
  actionability: z.number().min(1).max(5),
  consistency: z.number().min(1).max(5),
  rationale: z.string(),
});

export type JudgeScores = z.infer<typeof judgeSchema> & { average: number };

export async function judgeReport(
  ideaText: string,
  report: EvalReportSnapshot,
): Promise<JudgeScores> {
  const excerpt = report.sections.map(formatSectionForJudge).join("\n\n");

  const scores = await parsedCompletion(
    "eval-llm-judge",
    smallModel,
    smallModelName,
    judgeSchema,
    {
      temperature: 0,
      instructions: `Score a startup validation memo 1–5 on:
specificity — proper nouns, IDR figures, cities, named competitors (or honest tidak menemukan)
skepticism — not a cheerleader; names weaknesses and incumbents
actionability — experiments a founder can run this week with method, metric, days, cost
consistency — verdict, section scores, and bodies do not contradict

Calibration:
4.0 is a solid MVP memo: named players or explicit gaps, at least one concrete test, skeptical tone.
3.0 is generic, missing numbers, or mildly promotional.
5.0 is rare.
2.0 or below if facts look invented or sections contradict.`,
      input: `Idea:\n${ideaText}\n\nVerdict ${report.verdict} score ${report.overallScore}\n\n${excerpt}`,
    },
  );

  const average =
    (scores.specificity +
      scores.skepticism +
      scores.actionability +
      scores.consistency) /
    4;

  return { ...scores, average: Math.round(average * 10) / 10 };
}

function formatSectionForJudge(section: EvalReportSnapshot["sections"][number]) {
  const full =
    section.key === "competition" ||
    section.key === "assumptions" ||
    section.key === "summary" ||
    section.key === "gtm" ||
    section.key === "businessModel";
  const body = full
    ? section.content.body
    : section.content.body.slice(0, 500);
  const assumptions = section.content.assumptions
    ?.map(
      (item) =>
        `- ${item.assumption} | uji: ${item.test} | sukses: ${item.successMetric} | ${item.days} hari | Rp${item.costIdr}`,
    )
    .join("\n");
  return [`${section.key} (${section.score}): ${body}`, assumptions]
    .filter(Boolean)
    .join("\n");
}
