export const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type ReportStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed";

export type NormalizedIdea = {
  accepted: boolean;
  rejectReason: string;
  oneLiner: string;
  problem: string;
  solution: string;
  customer: string;
  monetization: string;
  region: string;
  stage: string;
  language: "id" | "en";
  clarityScore: number;
};

export type AssumptionItem = {
  assumption: string;
  fatal: boolean;
  test: string;
  successMetric: string;
  days: number;
  costIdr: number;
};

export type SectionContent = {
  body: string;
  rationale?: string;
  citations?: number[];
  market?: {
    tam: string;
    sam: string;
    som: string;
    assumptions: string;
  };
  assumptions?: AssumptionItem[];
};

export type ReportSection = {
  id: string;
  key: string;
  content: SectionContent;
  score: number | null;
  confidence: string | null;
  grounded: boolean;
};

export type ReportSource = {
  id: string;
  sectionKey: string;
  url: string;
  title: string | null;
  snippet: string | null;
};

export type ChatChange = {
  sectionKey: string;
  label: string;
  before: string;
  after: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
};

export type ChatDelta = {
  kind: "followup" | "whatif";
  overallScoreBefore: number | null;
  overallScoreAfter: number | null;
  verdictBefore: string | null;
  verdictAfter: string | null;
  changes: ChatChange[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  delta: ChatDelta | null;
  createdAt: string;
};

export type Report = {
  id: string;
  ideaText: string;
  ideaName: string | null;
  status: ReportStatus;
  verdict: string | null;
  overallScore: number | null;
  isPublic: boolean;
  isOwner: boolean;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  normalizedIdea: NormalizedIdea | null;
  sections: ReportSection[];
  sources: ReportSource[];
  messages: ChatMessage[];
  createdAt: string;
};

export type ReportSummary = {
  id: string;
  ideaName: string | null;
  ideaText: string;
  status: ReportStatus;
  verdict: string | null;
  overallScore: number | null;
  createdAt: string;
};

export const SECTION_ORDER = [
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

export const SECTION_TITLES: Record<(typeof SECTION_ORDER)[number], string> = {
  summary: "Ringkasan & verdict",
  problem: "Masalah & solusi",
  customer: "Target customer",
  market: "Pasar",
  competition: "Kompetitor & diferensiasi",
  businessModel: "Model bisnis & pricing",
  gtm: "Go-to-market",
  risk: "Risiko",
  assumptions: "Asumsi kritis & eksperimen",
};

export function isFinished(status: ReportStatus) {
  return status === "completed" || status === "partial" || status === "failed";
}

export async function fetchReport(
  reportId: string,
  ownerToken?: string | null,
): Promise<Report> {
  const query = ownerToken
    ? `?ownerToken=${encodeURIComponent(ownerToken)}`
    : "";
  const response = await fetch(`${API_URL}/api/reports/${reportId}${query}`);
  if (!response.ok) {
    throw new Error("Laporan tidak ditemukan");
  }
  return (await response.json()) as Report;
}

export async function fetchReportHistory(
  ownerToken: string,
): Promise<ReportSummary[]> {
  const response = await fetch(
    `${API_URL}/api/reports?ownerToken=${encodeURIComponent(ownerToken)}`,
  );
  if (!response.ok) {
    throw new Error("Gagal memuat riwayat");
  }
  const payload = (await response.json()) as { reports: ReportSummary[] };
  return payload.reports;
}

export async function shareReport(
  reportId: string,
  ownerToken: string,
): Promise<{ shareUrl: string; isPublic: boolean }> {
  const response = await fetch(`${API_URL}/api/reports/${reportId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerToken }),
  });
  const payload = (await response.json()) as {
    isPublic?: boolean;
    error?: string;
  };
  if (!response.ok || payload.isPublic == null) {
    throw new Error(payload.error || "Gagal membuat tautan");
  }
  return {
    isPublic: payload.isPublic,
    shareUrl: `${window.location.origin}/reports/${reportId}`,
  };
}

export async function downloadReportPdf(
  reportId: string,
  ownerToken?: string | null,
) {
  const query = ownerToken
    ? `?ownerToken=${encodeURIComponent(ownerToken)}`
    : "";
  const response = await fetch(`${API_URL}/api/reports/${reportId}/pdf${query}`);
  if (!response.ok) {
    throw new Error("Gagal mengunduh PDF");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kaji-${reportId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function reportEventsUrl(
  reportId: string,
  ownerToken?: string | null,
) {
  const query = ownerToken
    ? `?ownerToken=${encodeURIComponent(ownerToken)}`
    : "";
  return `${API_URL}/api/reports/${reportId}/events${query}`;
}

export async function sendReportMessage(
  reportId: string,
  content: string,
  ownerToken: string,
): Promise<ChatMessage> {
  const response = await fetch(`${API_URL}/api/reports/${reportId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, ownerToken }),
  });
  const payload = (await response.json()) as ChatMessage & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Gagal mengirim pertanyaan");
  }
  return payload;
}

export type GoldenCaseView = {
  id: string;
  band: string;
  expectedVerdicts: string[];
  requiredCompetitors: string[];
  expectReject: boolean;
  ideaText: string;
};

export type EvalCheckView = {
  name: string;
  pass: boolean;
  detail: string;
};

export type EvalRunView = {
  id: string;
  promptVersion: string;
  createdAt: string;
  results: {
    summary?: {
      cases: number;
      passed: number;
      passRate: number;
      judgeAverage: number | null;
      weakVerdictOk: boolean;
      costAverage?: number | null;
      costBudgetOk?: boolean;
    };
    cases?: Array<{
      id: string;
      band: string;
      passed: boolean;
      verdict: string | null;
      overallScore: number | null;
      elapsedMs: number;
      costUsd?: number | null;
      checks: EvalCheckView[];
      judge: { average: number } | null;
    }>;
  };
};

export async function fetchGoldenSet(): Promise<GoldenCaseView[]> {
  const response = await fetch(`${API_URL}/api/evals/golden`);
  if (!response.ok) {
    throw new Error("Gagal memuat golden set");
  }
  const payload = (await response.json()) as { cases: GoldenCaseView[] };
  return payload.cases;
}

export async function fetchEvalRuns(): Promise<EvalRunView[]> {
  const response = await fetch(`${API_URL}/api/evals`);
  if (!response.ok) {
    throw new Error("Gagal memuat eval");
  }
  const payload = (await response.json()) as { runs: EvalRunView[] };
  return payload.runs;
}
