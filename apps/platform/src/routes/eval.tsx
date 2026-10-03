import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  fetchEvalRuns,
  fetchGoldenSet,
  type EvalRunView,
  type GoldenCaseView,
} from "../lib/api";

export const Route = createFileRoute("/eval")({
  component: EvalPage,
});

function EvalPage() {
  const [runs, setRuns] = useState<EvalRunView[]>([]);
  const [golden, setGolden] = useState<GoldenCaseView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchEvalRuns(), fetchGoldenSet()])
      .then(([nextRuns, nextGolden]) => {
        setRuns(nextRuns);
        setGolden(nextGolden);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Gagal memuat eval");
      });
  }, []);

  const latest = runs[0];
  const summary = latest?.results?.summary;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-neutral-500">
            Kaji
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Eval & golden set
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            20 ide tetap. Pemeriksa otomatis plus LLM-as-judge. Jalankan{" "}
            <code className="text-xs">pnpm eval -- --limit=2</code>
          </p>
        </div>
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          Beranda
        </Link>
      </header>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {summary ? (
        <section className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Run terbaru · {latest.promptVersion}
          </p>
          <p>
            Lolos {summary.passed}/{summary.cases} (
            {Math.round(summary.passRate * 100)}%)
          </p>
          <p>
            Judge rata-rata {summary.judgeAverage ?? "n/a"} (target ≥ 4.0)
          </p>
          <p>
            Ide lemah Stop/Pivot: {summary.weakVerdictOk ? "ya" : "tidak"}
          </p>
          {"costAverage" in summary && summary.costAverage != null ? (
            <p>
              Biaya rata-rata ${Number(summary.costAverage).toFixed(4)} (target ≤
              $0.15)
              {"costBudgetOk" in summary
                ? summary.costBudgetOk
                  ? " · lolos"
                  : " · over budget"
                : null}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-neutral-500">
          Belum ada run. Dari root repo: pnpm eval -- --limit=2
        </p>
      )}

      {latest?.results?.cases?.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-neutral-500">Kasus run terbaru</h2>
          <ul className="grid gap-2">
            {latest.results.cases.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"
              >
                <p className="font-medium">
                  {item.passed ? "lolos" : "gagal"} · {item.id} · {item.band}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {item.verdict ?? "rejected"} · {item.elapsedMs} ms
                  {item.judge ? ` · judge ${item.judge.average}` : ""}
                </p>
                <ul className="mt-2 grid gap-1 text-xs text-neutral-600">
                  {item.checks.map((check) => (
                    <li key={check.name}>
                      {check.pass ? "ok" : "x"} {check.name}: {check.detail}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-sm font-medium text-neutral-500">
          Golden set ({golden.length})
        </h2>
        <ul className="grid gap-2">
          {golden.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"
            >
              <p className="font-medium">
                {item.id} · {item.band}
                {item.expectReject ? " · reject" : ""}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Verdict: {item.expectedVerdicts.join(" / ")}
                {item.requiredCompetitors.length
                  ? ` · wajib sebut ${item.requiredCompetitors.join(", ")}`
                  : ""}
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-700">
                {item.ideaText}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
