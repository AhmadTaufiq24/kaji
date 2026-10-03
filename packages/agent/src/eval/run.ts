import { PIPELINE_VERSION } from "../constants.js";
import {
  IdeaRejectedError,
  runValidationPipeline,
} from "../pipeline/run-validation.js";
import { GOLDEN_SET, type GoldenCase } from "./golden-set.js";
import {
  runAutomatedChecks,
  weakBandUsesStopOrPivot,
  type EvalReportSnapshot,
} from "./checks.js";
import { judgeReport, type JudgeScores } from "./judge.js";

export type CaseEvalResult = {
  id: string;
  band: GoldenCase["band"];
  passed: boolean;
  rejected: boolean;
  verdict: string | null;
  overallScore: number | null;
  elapsedMs: number;
  costUsd: number | null;
  checks: ReturnType<typeof runAutomatedChecks>;
  judge: JudgeScores | null;
};

export type EvalRunResult = {
  promptVersion: string;
  startedAt: string;
  finishedAt: string;
  summary: {
    cases: number;
    passed: number;
    passRate: number;
    judgeAverage: number | null;
    weakVerdictOk: boolean;
    citationChecksPassed: number;
    costAverage: number | null;
    costBudgetOk: boolean;
  };
  cases: CaseEvalResult[];
};

export async function evaluateGoldenSet(options: {
  limit?: number;
  judge?: boolean;
  ids?: string[];
}): Promise<EvalRunResult> {
  const startedAt = new Date().toISOString();
  let selected = GOLDEN_SET;
  if (options.ids?.length) {
    selected = GOLDEN_SET.filter((item) => options.ids!.includes(item.id));
  }
  if (options.limit && options.limit > 0) {
    selected = selected.slice(0, options.limit);
  }

  const cases: CaseEvalResult[] = [];
  for (const golden of selected) {
    cases.push(await evaluateOne(golden, options.judge !== false));
  }

  const passed = cases.filter((item) => item.passed).length;
  const judgeScores = cases
    .map((item) => item.judge?.average)
    .filter((value): value is number => typeof value === "number");
  const weakVerdictOk = cases
    .filter((item) => item.band === "weak")
    .every((item) => weakBandUsesStopOrPivot(item.band, item.verdict));
  const citationChecksPassed = cases.filter((item) =>
    item.checks.some((check) => check.name === "citation-urls" && check.pass),
  ).length;
  const costs = cases
    .map((item) => item.costUsd)
    .filter((value): value is number => typeof value === "number");
  const costBudgetOk = cases.every((item) =>
    item.checks
      .filter((check) => check.name === "cost-budget")
      .every((check) => check.pass),
  );

  return {
    promptVersion: PIPELINE_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: {
      cases: cases.length,
      passed,
      passRate: cases.length ? passed / cases.length : 0,
      judgeAverage: judgeScores.length
        ? Math.round(
            (judgeScores.reduce((sum, value) => sum + value, 0) /
              judgeScores.length) *
              10,
          ) / 10
        : null,
      weakVerdictOk,
      citationChecksPassed,
      costAverage: costs.length
        ? Math.round(
            (costs.reduce((sum, value) => sum + value, 0) / costs.length) *
              10_000,
          ) / 10_000
        : null,
      costBudgetOk,
    },
    cases,
  };
}

async function evaluateOne(
  golden: GoldenCase,
  withJudge: boolean,
): Promise<CaseEvalResult> {
  const started = Date.now();
  let snapshot: EvalReportSnapshot;

  try {
    const result = await runValidationPipeline({
      reportId: `eval-${golden.id}-${Date.now()}`,
      ideaText: golden.ideaText,
      region: "Indonesia",
    });
    snapshot = {
      rejected: false,
      verdict: result.verdict,
      overallScore: result.overallScore,
      sections: result.sections,
      sources: result.sources,
      costUsd: result.usage.costUsd,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof IdeaRejectedError) {
      snapshot = {
        rejected: true,
        rejectReason: error.reason,
        verdict: "Stop",
        overallScore: null,
        sections: [],
        sources: [],
        costUsd: null,
        elapsedMs: Date.now() - started,
      };
    } else {
      throw error;
    }
  }

  const checks = runAutomatedChecks(golden, snapshot);
  const judge =
    withJudge && !snapshot.rejected
      ? await judgeReport(golden.ideaText, snapshot)
      : null;
  const passed =
    checks.every((check) => check.pass) &&
    weakBandUsesStopOrPivot(golden.band, snapshot.verdict);

  return {
    id: golden.id,
    band: golden.band,
    passed,
    rejected: snapshot.rejected,
    verdict: snapshot.verdict,
    overallScore: snapshot.overallScore,
    elapsedMs: Date.now() - started,
    costUsd: snapshot.costUsd ?? null,
    checks,
    judge,
  };
}
