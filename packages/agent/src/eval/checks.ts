import { SECTION_KEYS } from "../constants.js";
import type { GeneratedSection } from "../pipeline/generate-section.js";
import type { ResearchSource } from "../pipeline/research.js";
import type { Verdict } from "../scoring.js";
import type { GoldenCase } from "./golden-set.js";
import { COST_BUDGET_USD } from "../pricing.js";

export type EvalCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

export type EvalReportSnapshot = {
  rejected: boolean;
  rejectReason?: string;
  verdict: string | null;
  overallScore: number | null;
  sections: GeneratedSection[];
  sources: ResearchSource[];
  costUsd?: number | null;
  elapsedMs?: number | null;
};

function foldCompetitorText(value: string) {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

const GENERIC = /pasar yang besar dan berkembang/i;

export function runAutomatedChecks(
  golden: GoldenCase,
  report: EvalReportSnapshot,
): EvalCheck[] {
  if (golden.expectReject) {
    return [
      {
        name: "reject-non-idea",
        pass: report.rejected,
        detail: report.rejected
          ? report.rejectReason || "rejected"
          : "expected reject, but pipeline accepted",
      },
    ];
  }

  const bodies = report.sections
    .map((section) => section.content.body)
    .join("\n");
  const competition = report.sections.find((section) => section.key === "competition");
  const assumptions = report.sections.find((section) => section.key === "assumptions");
  const assumptionCount = assumptions?.content.assumptions?.length ?? 0;
  const keys = new Set(report.sections.map((section) => section.key));
  const missing = SECTION_KEYS.filter((key) => !keys.has(key));
  const liveSources = report.sources.filter((source) =>
    /^https?:\/\//i.test(source.url),
  );
  const citationRate =
    report.sources.length === 0 ? 0 : liveSources.length / report.sources.length;

  const competitorHaystack = foldCompetitorText(
    `${competition?.content.body ?? ""}\n${report.sources
      .map((source) => `${source.title} ${source.url}`)
      .join(" ")}`,
  );

  const missingCompetitors = golden.requiredCompetitors.filter(
    (name) => !competitorHaystack.includes(foldCompetitorText(name)),
  );

  const verdictOk =
    report.verdict != null &&
    golden.expectedVerdicts.includes(report.verdict as Verdict);

  return [
    {
      name: "schema-nine-sections",
      pass: missing.length === 0 && !report.rejected,
      detail: missing.length ? `missing ${missing.join(", ")}` : "9 sections",
    },
    {
      name: "assumptions-count",
      pass: assumptionCount >= 5 && assumptionCount <= 8,
      detail: `${assumptionCount} assumptions`,
    },
    {
      name: "no-generic-phrase",
      pass: !GENERIC.test(bodies),
      detail: GENERIC.test(bodies)
        ? "contains 'pasar yang besar dan berkembang'"
        : "clean",
    },
    {
      name: "verdict-in-range",
      pass: verdictOk,
      detail: `got ${report.verdict ?? "none"}; allowed ${golden.expectedVerdicts.join("/")}`,
    },
    {
      name: "required-competitors",
      pass: golden.requiredCompetitors.length === 0 || missingCompetitors.length === 0,
      detail:
        missingCompetitors.length > 0
          ? `missing ${missingCompetitors.join(", ")}`
          : "ok",
    },
    {
      name: "citation-urls",
      pass: liveSources.length >= 3 && citationRate >= 0.9,
      detail: `${liveSources.length}/${report.sources.length} http(s) urls`,
    },
    {
      name: "cost-budget",
      pass:
        report.costUsd == null ||
        report.rejected ||
        report.costUsd <= COST_BUDGET_USD,
      detail:
        report.costUsd == null
          ? "n/a"
          : `$${report.costUsd.toFixed(4)} (budget $${COST_BUDGET_USD})`,
    },
    {
      name: "latency-90s",
      pass:
        report.elapsedMs == null ||
        report.rejected ||
        report.elapsedMs <= 90_000,
      detail:
        report.elapsedMs == null
          ? "n/a"
          : `${Math.round(report.elapsedMs / 1000)}s`,
    },
  ];
}

export function weakBandUsesStopOrPivot(band: GoldenCase["band"], verdict: string | null) {
  if (band !== "weak") return true;
  return verdict === "Stop" || verdict === "Pivot";
}
