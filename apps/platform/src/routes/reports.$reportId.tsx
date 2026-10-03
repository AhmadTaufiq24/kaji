import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  SECTION_ORDER,
  SECTION_TITLES,
  downloadReportPdf,
  fetchReport,
  isFinished,
  reportEventsUrl,
  sendReportMessage,
  shareReport,
  type AssumptionItem,
  type ChatDelta,
  type ChatMessage,
  type Report,
  type ReportSection,
  type ReportSource,
} from "../lib/api";
import { peekOwnerToken } from "../lib/owner";

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportPage,
});

const SECTION_HINTS: Record<(typeof SECTION_ORDER)[number], string> = {
  summary: "Merangkum verdict…",
  problem: "Menguji masalah & solusi…",
  customer: "Mempertajam segmen…",
  market: "Mencari data pasar…",
  competition: "Mencari kompetitor…",
  businessModel: "Menghitung unit economics…",
  gtm: "Menyusun go-to-market…",
  risk: "Memetakan risiko…",
  assumptions: "Menyusun eksperimen…",
};

function verdictTone(verdict: string | null) {
  if (!verdict) return "verdict-caution";
  if (verdict === "Proceed") return "verdict-proceed";
  if (verdict === "Proceed with caution") return "verdict-caution";
  if (verdict === "Pivot") return "verdict-pivot";
  if (verdict === "Stop") return "verdict-stop";
  return "verdict-caution";
}

function whyLine(report: Report) {
  const weak = [...report.sections]
    .filter((section) => section.key !== "summary" && section.score != null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 2);
  if (weak.length === 0) {
    return report.status === "running" || report.status === "queued"
      ? "Verdict muncul setelah semua bagian selesai."
      : null;
  }
  return `Paling lemah: ${weak
    .map(
      (section) =>
        `${SECTION_TITLES[section.key as (typeof SECTION_ORDER)[number]] ?? section.key} (${section.score})`,
    )
    .join(" · ")}`;
}

function ReportPage() {
  const { reportId } = Route.useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;
    let source: EventSource | null = null;

    async function load() {
      try {
        const next = await fetchReport(reportId, peekOwnerToken());
        if (cancelled) return;
        setReport(next);
        setError(null);
        return next;
      } catch (cause) {
        if (cancelled) return null;
        setError(cause instanceof Error ? cause.message : "Gagal memuat laporan");
        return null;
      }
    }

    function schedulePoll(ms: number) {
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(async () => {
        const next = await load();
        if (cancelled || !next) {
          schedulePoll(3000);
          return;
        }
        if (!isFinished(next.status)) schedulePoll(4000);
      }, ms);
    }

    void load().then((next) => {
      if (cancelled || !next) {
        schedulePoll(3000);
        return;
      }
      if (isFinished(next.status)) return;

      try {
        source = new EventSource(reportEventsUrl(reportId, peekOwnerToken()));
        source.addEventListener("progress", () => {
          void load().then((fresh) => {
            if (fresh && isFinished(fresh.status)) {
              source?.close();
              source = null;
            }
          });
        });
        source.onerror = () => {
          source?.close();
          source = null;
          schedulePoll(1500);
        };
      } catch {
        schedulePoll(1500);
      }
      schedulePoll(5000);
    });

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      source?.close();
    };
  }, [reportId]);

  const sectionsByKey = useMemo(
    () => new Map((report?.sections ?? []).map((section) => [section.key, section])),
    [report?.sections],
  );
  const readyCount = SECTION_ORDER.filter((key) => sectionsByKey.has(key)).length;
  const done = report ? isFinished(report.status) : false;
  const waiting = Boolean(report && !done && report.status !== "failed");
  const summary = sectionsByKey.get("summary");
  const competition = sectionsByKey.get("competition");
  const assumptions = sectionsByKey.get("assumptions");
  const decisionWhy =
    firstSentences(summary?.content.body ?? "", 2) ||
    summary?.content.rationale ||
    (report ? whyLine(report) : null);
  const competitors = useMemo(
    () =>
      parseCompetitors(
        competition?.content.body ?? "",
        report?.sources ?? [],
      ),
    [competition?.content.body, report?.sources],
  );
  const nextTests = useMemo(() => {
    const items = assumptions?.content.assumptions ?? [];
    const fatal = items.filter((item) => item.fatal);
    return (fatal.length ? fatal : items).slice(0, 2);
  }, [assumptions?.content.assumptions]);
  const memoKeys = SECTION_ORDER.filter((key) => key !== "summary");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-20 pt-8 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            to="/"
            className="font-hero inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-stone-800 no-print"
          >
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 rounded-sm border border-stone-800"
              style={{
                background:
                  "linear-gradient(135deg, transparent 46%, #1c1917 46%, #1c1917 54%, transparent 54%), linear-gradient(45deg, transparent 46%, #1c1917 46%, #1c1917 54%, transparent 54%)",
              }}
            />
            Kaji
          </Link>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            {report?.ideaName ?? "Laporan validasi"}
          </h1>
        </div>
        <div className="no-print flex flex-col items-end gap-2">
          <Link to="/" className="text-sm text-stone-500 hover:text-stone-900">
            Ide baru
          </Link>
          {report ? (
            <ReportActions
              report={report}
              onPublic={() =>
                setReport((current) =>
                  current ? { ...current, isPublic: true } : current,
                )
              }
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-red-700">{error}</p>
      ) : null}

      {report?.status === "failed" ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {report.verdict ?? "Ide tidak bisa diproses."}
        </p>
      ) : null}

      {report && report.status !== "failed" ? (
        <DecisionBoard
          score={report.overallScore}
          verdict={report.verdict}
          status={report.status}
          costUsd={report.costUsd}
          why={decisionWhy}
          readyCount={readyCount}
          total={SECTION_ORDER.length}
          waiting={waiting}
          competitors={competitors}
          nextTests={nextTests}
          competitionReady={Boolean(competition)}
          assumptionsReady={Boolean(assumptions)}
        />
      ) : null}

      {waiting ? (
        <p className="mt-4 rounded-xl border border-stone-200 bg-[var(--panel)] px-4 py-3 text-sm text-stone-600">
          {report?.status === "queued"
            ? "Masih dalam antrean. Biasanya 1–2 menit setelah giliran."
            : `Sedang mengkaji… ${readyCount}/${SECTION_ORDER.length} bagian siap.`}
        </p>
      ) : null}

      {report && report.status !== "failed" ? (
        <section id="memo" className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                Memo
              </p>
              <h2 className="font-display mt-1 text-xl font-semibold text-stone-900">
                Detail lengkap
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Buka hanya bagian yang perlu. Keputusan ada di atas.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {memoKeys.map((key) => {
              const section = sectionsByKey.get(key);
              if (!section) {
                return waiting ? (
                  <Placeholder
                    key={key}
                    id={`section-${key}`}
                    title={SECTION_TITLES[key]}
                    hint={SECTION_HINTS[key]}
                  />
                ) : null;
              }
              return (
                <MemoSection
                  key={section.id}
                  id={`section-${key}`}
                  section={section}
                  title={SECTION_TITLES[key]}
                  sources={report.sources}
                />
              );
            })}
          </div>

          {done && report.sources.length ? (
            <details
              id="section-sources"
              className="memo-section print-only-sources mt-2 rounded-xl border border-stone-200 bg-[var(--panel)]"
            >
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-800 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  Daftar sumber
                  <span className="text-xs font-normal text-stone-400">
                    {report.sources.length} · buka
                  </span>
                </span>
              </summary>
              <ul className="grid gap-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-700">
                {report.sources.map((source, index) => (
                  <li key={source.id}>
                    [{index + 1}]{" "}
                    <a
                      href={source.url}
                      className="underline decoration-stone-300 hover:text-stone-900"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {done && report.ideaText ? (
            <details className="mt-3 text-sm text-stone-500">
              <summary className="cursor-pointer">Ide asli</summary>
              <p className="mt-2 leading-6">{report.ideaText}</p>
            </details>
          ) : null}
        </section>
      ) : null}

      {done && report?.isOwner ? (
        <div className="no-print mt-10">
          <ChatPanel
            reportId={report.id}
            messages={report.messages ?? []}
            onMessages={(messages) =>
              setReport((current) =>
                current ? { ...current, messages } : current,
              )
            }
          />
        </div>
      ) : null}
    </main>
  );
}

type CompetitorRow = {
  name: string;
  url: string | null;
  price: string;
};

function firstSentences(text: string, count: number) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  return parts.slice(0, count).join(" ").trim() || null;
}

function parseCompetitors(body: string, sources: ReportSource[]): CompetitorRow[] {
  const rows: CompetitorRow[] = [];
  for (const raw of body.split(/\n+/)) {
    const line = raw.replace(/^[-*•]\s*/, "").trim();
    if (!line) continue;
    const match = line.match(
      /^(.+?)\s*\((https?:\/\/[^)\s]+|[^)\s]*\.[a-z]{2,}[^)]*)\)\s*[—–-]\s*harga:\s*(.+?)(?:\s*\[\d+\])?\s*$/i,
    );
    if (!match) continue;
    const hostOrUrl = match[2]!.trim();
    const url = hostOrUrl.startsWith("http")
      ? hostOrUrl
      : `https://${hostOrUrl.replace(/^\/\//, "")}`;
    rows.push({
      name: match[1]!.replace(/\*+/g, "").trim(),
      url,
      price: match[3]!.replace(/\*+/g, "").trim(),
    });
    if (rows.length >= 4) break;
  }
  if (rows.length > 0) return rows;

  return sources
    .filter((source) => source.sectionKey === "competition")
    .slice(0, 4)
    .map((source) => {
      let name = source.title || source.url;
      try {
        name = new URL(source.url).hostname.replace(/^www\./, "");
      } catch {
        // keep title
      }
      return {
        name,
        url: source.url,
        price: "lihat sumber",
      };
    });
}

function DecisionBoard({
  score,
  verdict,
  status,
  costUsd,
  why,
  readyCount,
  total,
  waiting,
  competitors,
  nextTests,
  competitionReady,
  assumptionsReady,
}: {
  score: number | null;
  verdict: string | null;
  status: string;
  costUsd: number | null;
  why: string | null;
  readyCount: number;
  total: number;
  waiting: boolean;
  competitors: CompetitorRow[];
  nextTests: AssumptionItem[];
  competitionReady: boolean;
  assumptionsReady: boolean;
}) {
  const tone = verdictTone(verdict);

  return (
    <section className="section-enter rounded-2xl border border-stone-200 bg-[var(--panel)] p-5 shadow-[0_1px_0_rgba(28,25,23,0.04)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
            Keputusan
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            {score != null ? (
              <p className="font-display text-5xl font-semibold tracking-tight text-stone-900">
                {score}
              </p>
            ) : (
              <p className="font-display text-3xl font-semibold text-stone-300">—</p>
            )}
            {verdict ? (
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${tone}`}
              >
                {verdict}
              </span>
            ) : waiting ? (
              <span className="text-sm text-stone-500">Sedang dihitung…</span>
            ) : null}
          </div>
          {why ? (
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-700">{why}</p>
          ) : null}
        </div>
        <div className="text-right text-xs text-stone-500">
          <p>
            {readyCount}/{total} bagian
          </p>
          {costUsd != null ? (
            <p className="mt-1">
              ${costUsd.toFixed(4)}
              {costUsd > 0.15 ? " · di atas budget" : ""}
            </p>
          ) : null}
          {status === "partial" ? (
            <p className="mt-1 text-amber-700">Sebagian tidak tersumber</p>
          ) : null}
        </div>
      </div>

      {waiting ? (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${Math.round((readyCount / total) * 100)}%` }}
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 border-t border-stone-100 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
            Kompetitor
          </p>
          {!competitionReady && waiting ? (
            <p className="mt-2 text-sm text-stone-400">Mencari kompetitor…</p>
          ) : competitors.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Belum ada daftar jelas.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {competitors.map((row) => (
                <li
                  key={`${row.name}-${row.url}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-stone-900">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-stone-300 hover:text-stone-700"
                      >
                        {row.name}
                      </a>
                    ) : (
                      row.name
                    )}
                  </span>
                  <span className="shrink-0 text-stone-500">{row.price}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
            Uji minggu ini
          </p>
          {!assumptionsReady && waiting ? (
            <p className="mt-2 text-sm text-stone-400">Menyusun eksperimen…</p>
          ) : nextTests.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Belum ada eksperimen.</p>
          ) : (
            <ul className="mt-2 grid gap-3">
              {nextTests.map((item, index) => (
                <li key={index} className="text-sm leading-6 text-stone-800">
                  <p className="font-medium">
                    {item.fatal ? (
                      <span className="mr-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-red-800 uppercase">
                        fatal
                      </span>
                    ) : null}
                    {item.assumption}
                  </p>
                  <p className="mt-1 text-stone-600">
                    <span className="text-stone-400">Uji · </span>
                    {item.test}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Sukses jika {item.successMetric} · {item.days} hari · Rp{" "}
                    {item.costIdr.toLocaleString("id-ID")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <a
        href="#memo"
        className="no-print mt-6 inline-flex text-sm text-stone-500 underline decoration-stone-300 hover:text-stone-900"
      >
        Lihat memo lengkap
      </a>
    </section>
  );
}

function ReportActions({
  report,
  onPublic,
}: {
  report: Report;
  onPublic: () => void;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(
    report.isPublic ? `${window.location.origin}/reports/${report.id}` : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busyPdf, setBusyPdf] = useState(false);

  if (!report.isOwner || !isFinished(report.status) || report.status === "failed") {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          className="text-sm text-stone-500 hover:text-stone-900 disabled:opacity-50"
          disabled={busyPdf}
          onClick={async () => {
            setBusyPdf(true);
            setMessage(null);
            try {
              await downloadReportPdf(report.id, peekOwnerToken());
              setMessage("PDF diunduh.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Gagal mengunduh PDF",
              );
            } finally {
              setBusyPdf(false);
            }
          }}
        >
          {busyPdf ? "Menyiapkan…" : "Ekspor PDF"}
        </button>
        <button
          type="button"
          className="text-sm text-stone-500 hover:text-stone-900"
          onClick={async () => {
            const token = peekOwnerToken();
            if (!token) return;
            try {
              const result = await shareReport(report.id, token);
              setShareUrl(result.shareUrl);
              await navigator.clipboard.writeText(result.shareUrl);
              onPublic();
              setMessage("Tautan disalin. Siapa pun dengan tautan bisa baca.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Gagal membagikan",
              );
            }
          }}
        >
          {shareUrl ? "Salin tautan" : "Bagikan"}
        </button>
      </div>
      {message ? <p className="text-xs text-stone-500">{message}</p> : null}
    </div>
  );
}

function Placeholder({
  id,
  title,
  hint,
}: {
  id: string;
  title: string;
  hint: string;
}) {
  return (
    <section
      id={id}
      className="rounded-xl border border-dashed border-stone-300 bg-[var(--panel)]/70 px-4 py-3"
    >
      <p className="text-sm font-medium text-stone-400">{title}</p>
      <p className="mt-1 text-xs text-stone-400">{hint}</p>
    </section>
  );
}

function MemoSection({
  id,
  section,
  title,
  sources,
}: {
  id: string;
  section: ReportSection;
  title: string;
  sources: ReportSource[];
}) {
  const content = section.content ?? { body: "" };
  const sectionSources = sources.filter(
    (source) => source.sectionKey === section.key,
  );
  const isAssumptions = section.key === "assumptions";

  return (
    <details
      id={id}
      className="memo-section section-enter rounded-xl border border-stone-200 bg-[var(--panel)]"
    >
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span className="font-display text-base font-semibold text-stone-900">
            {title}
          </span>
          <span className="flex items-center gap-2">
            {section.key === "market" || section.key === "competition" ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  section.grounded
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {section.grounded ? "bersumber" : "tidak bersumber"}
              </span>
            ) : null}
            {section.score != null ? (
              <span className="text-sm tabular-nums text-stone-500">
                {section.score}
              </span>
            ) : null}
            <span className="text-xs text-stone-400">buka</span>
          </span>
        </span>
      </summary>

      <div className="grid gap-3 border-t border-stone-100 px-4 py-4">
        {!isAssumptions || !content.assumptions?.length ? (
          <p className="text-sm leading-7 text-stone-800 whitespace-pre-wrap">
            {content.body}
          </p>
        ) : null}
        {content.market ? (
          <dl className="grid gap-3 rounded-lg border border-stone-100 bg-stone-50/80 p-3 text-sm sm:grid-cols-3">
            <Fact label="TAM" value={content.market.tam} />
            <Fact label="SAM" value={content.market.sam} />
            <Fact label="SOM" value={content.market.som} />
            <div className="sm:col-span-3">
              <Fact label="Asumsi angka" value={content.market.assumptions} />
            </div>
          </dl>
        ) : null}
        {content.assumptions?.length ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                Semua eksperimen
              </p>
              <CopyExperimentsButton assumptions={content.assumptions} />
            </div>
            <ol className="grid gap-3">
              {content.assumptions.map((item, index) => (
                <AssumptionRow key={index} item={item} index={index} />
              ))}
            </ol>
          </div>
        ) : null}
        {content.rationale ? (
          <p className="text-xs leading-5 text-stone-500">{content.rationale}</p>
        ) : null}
        <CitationList
          citations={content.citations ?? []}
          sources={sources}
          fallback={sectionSources}
        />
      </div>
    </details>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-stone-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 leading-6 text-stone-800">{value}</dd>
    </div>
  );
}

function formatExperiment(item: AssumptionItem, index: number) {
  return [
    `${index + 1}. ${item.assumption}${item.fatal ? " [fatal]" : ""}`,
    `Uji: ${item.test}`,
    `Sukses jika: ${item.successMetric}`,
    `Estimasi: ${item.days} hari · Rp ${item.costIdr.toLocaleString("id-ID")}`,
  ].join("\n");
}

function CopyExperimentsButton({
  assumptions,
}: {
  assumptions: AssumptionItem[];
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="no-print text-xs text-stone-500 hover:text-stone-900"
      onClick={async () => {
        const text = assumptions
          .map((item, index) => formatExperiment(item, index))
          .join("\n\n");
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Disalin" : "Salin eksperimen"}
    </button>
  );
}

function AssumptionRow({
  item,
  index,
}: {
  item: AssumptionItem;
  index: number;
}) {
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium leading-6 text-stone-900">
          {index + 1}. {item.assumption}
        </p>
        {item.fatal ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
            fatal
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
        <p>
          <span className="text-stone-400">Uji · </span>
          {item.test}
        </p>
        <p>
          <span className="text-stone-400">Sukses jika · </span>
          {item.successMetric}
        </p>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        {item.days} hari · Rp {item.costIdr.toLocaleString("id-ID")}
      </p>
    </li>
  );
}

function CitationList({
  citations,
  sources,
  fallback,
}: {
  citations: number[];
  sources: ReportSource[];
  fallback: ReportSource[];
}) {
  const used =
    citations.length > 0
      ? citations
          .map((n) => sources[n - 1])
          .filter((source): source is ReportSource => Boolean(source))
      : fallback.slice(0, 4);

  if (used.length === 0) return null;

  return (
    <ul className="grid gap-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
      {used.map((source, index) => (
        <li key={`${source.id}-${index}`}>
          [{index + 1}]{" "}
          <a
            href={source.url}
            className="underline decoration-stone-300 hover:text-stone-800"
            target="_blank"
            rel="noreferrer"
          >
            {source.title || source.url}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ChatPanel({
  reportId,
  messages,
  onMessages,
}: {
  reportId: string;
  messages: ChatMessage[];
  onMessages: (messages: ChatMessage[]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-[var(--panel)] p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Tanya lanjut</h2>
        <p className="mt-1 text-xs text-stone-500">
          Ubah asumsi (harga, segmen, CAC) untuk melihat delta. Laporan asli
          tidak diubah.
        </p>
      </div>

      {messages.map((message) => (
        <div key={message.id} className="grid gap-2">
          <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
            {message.role === "user" ? "Anda" : "Kaji"}
          </p>
          <p className="text-sm leading-6 text-stone-800">{message.content}</p>
          {message.role === "assistant" && message.delta?.kind === "whatif" ? (
            <DeltaList delta={message.delta} />
          ) : null}
        </div>
      ))}

      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const ownerToken = peekOwnerToken();
          if (!ownerToken) {
            setError("Token pemilik tidak ada. Buat laporan dari beranda dulu.");
            return;
          }
          setBusy(true);
          setError(null);
          const text = question.trim();
          setQuestion("");
          try {
            const reply = await sendReportMessage(reportId, text, ownerToken);
            const userMessage: ChatMessage = {
              id: `local-${Date.now()}`,
              role: "user",
              content: text,
              delta: null,
              createdAt: new Date().toISOString(),
            };
            onMessages([...messages, userMessage, reply]);
          } catch (cause) {
            setQuestion(text);
            setError(
              cause instanceof Error ? cause.message : "Gagal mengirim pertanyaan",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          required
          minLength={4}
          rows={3}
          value={question}
          disabled={busy}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Contoh: Kalau harganya Rp 49.000/bulan bagaimana?"
          className="rounded-lg border border-stone-300 bg-white p-3 text-sm leading-6 outline-none focus:border-stone-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="self-end rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Menjawab…" : "Kirim"}
        </button>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
    </section>
  );
}

function DeltaList({ delta }: { delta: ChatDelta }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-medium text-white">
          what-if
        </span>
        <p className="text-xs text-stone-500">Laporan asli tidak diubah</p>
      </div>
      {delta.overallScoreBefore != null && delta.overallScoreAfter != null ? (
        <p className="mt-3 font-display text-xl font-semibold text-stone-900">
          {delta.overallScoreBefore}
          <span className="mx-2 text-stone-400">→</span>
          {delta.overallScoreAfter}
          {delta.verdictBefore && delta.verdictAfter ? (
            <span className="ml-3 text-sm font-medium text-stone-600">
              {delta.verdictBefore} → {delta.verdictAfter}
            </span>
          ) : null}
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2">
        {delta.changes.map((change, index) => (
          <li
            key={`${change.sectionKey}-${index}`}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
          >
            <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
              {change.label || change.sectionKey}
            </p>
            <p className="mt-1">
              <span className="text-stone-500">{change.before}</span>
              <span className="mx-2 text-stone-400">→</span>
              <span className="text-stone-900">{change.after}</span>
            </p>
            {change.scoreBefore != null && change.scoreAfter != null ? (
              <p className="mt-1 text-xs text-stone-500">
                skor {change.scoreBefore} → {change.scoreAfter}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
