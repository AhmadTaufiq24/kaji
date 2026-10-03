import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { API_URL, fetchReportHistory, type ReportSummary } from "../lib/api";
import { getOwnerToken } from "../lib/owner";

export const Route = createFileRoute("/")({
  component: Home,
});

const EXAMPLES = [
  {
    label: "Kos / WhatsApp",
    ideaName: "KosPay",
    targetCustomer: "Pemilik kos 10–50 kamar",
    monetization: "Rp 99.000/bulan",
    text: "Aplikasi langganan untuk pemilik kos: pengingat tagihan via WhatsApp, pencatatan pembayaran, laporan bulanan. Target pemilik kos 10–50 kamar di kota besar. Rp 99.000/bulan.",
  },
  {
    label: "Pajak UMKM",
    ideaName: "Rekon Pajak",
    targetCustomer: "Konsultan pajak solo",
    monetization: "Rp 199.000/bulan",
    text: "Software e-faktur dan rekonsiliasi PPN untuk konsultan pajak solo yang menangani 20–80 klien UMKM. Impor CSV dari marketplace, deteksi invoice duplikat, reminder jatuh tempo. Rp 199.000/bulan. Target Jabodetabek dan Surabaya.",
  },
  {
    label: "HRIS pabrik",
    ideaName: "Absen Pabrik",
    targetCustomer: "Pabrik 20–100 orang",
    monetization: "Rp 15.000/karyawan/bulan",
    text: "HRIS absensi wajah dan slip gaji untuk pabrik 20–100 orang di Bekasi dan Karawang. Rp 15.000/karyawan/bulan. Integrasi BPJS kesehatan manual dulu.",
  },
] as const;

function Home() {
  const navigate = useNavigate();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [idea, setIdea] = useState("");
  const [ideaName, setIdeaName] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [monetization, setMonetization] = useState("");
  const [region, setRegion] = useState("Indonesia");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeExample, setActiveExample] = useState<string | null>(null);

  async function submitIdea() {
    if (busy || idea.trim().length < 50) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_URL}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaText: idea,
          ownerToken: getOwnerToken(),
          ideaName: ideaName.trim() || undefined,
          targetCustomer: targetCustomer.trim() || undefined,
          monetization: monetization.trim() || undefined,
          region: region.trim() || undefined,
          stage: stage.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        reportId?: string;
        error?: unknown;
      };
      if (!response.ok || !payload.reportId) {
        throw new Error("Gagal membuat laporan");
      }
      await navigate({
        to: "/reports/$reportId",
        params: { reportId: payload.reportId },
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gagal mengirim ide");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing-shell">
      <div className="landing-bg" aria-hidden />
      <div className="landing-noise" aria-hidden />

      <header className="landing-nav">
        <a href="#composer" className="landing-logo">
          <span className="landing-mark" aria-hidden />
          Kaji
        </a>
        <nav className="landing-nav-links" aria-label="Utama">
          <a href="#composer">Validasi</a>
          <a href="#riwayat">Riwayat</a>
          <a href="#composer">Cara kerja</a>
        </nav>
        <a className="landing-ghost-btn" href="#composer">
          Mulai
        </a>
      </header>

      <section className="landing-hero">
        <h1>Kaji dulu, baru bangun.</h1>
        <p className="lede">
          Dari ide mentah ke keputusan yang bisa dipercaya — laporan validasi
          skeptis, bersumber, siap diuji minggu ini.
        </p>
        <button
          type="button"
          className="landing-cta"
          onClick={() => composerRef.current?.focus()}
        >
          Mulai kaji
        </button>
      </section>

      <form
        id="composer"
        className="glass-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submitIdea();
        }}
      >
        <textarea
          ref={composerRef}
          required
          minLength={50}
          maxLength={3000}
          rows={4}
          value={idea}
          onChange={(event) => {
            setIdea(event.target.value);
            setActiveExample(null);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submitIdea();
            }
          }}
          placeholder="Tulis ide Anda. Contoh: aplikasi langganan untuk pemilik kos, pengingat tagihan WhatsApp, Rp 99.000/bulan…"
          aria-label="Ceritakan ide Anda"
        />

        <div className="glass-toolbar">
          <div className="glass-tools">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="glass-chip"
                data-active={activeExample === example.label}
                onClick={() => {
                  setIdea(example.text);
                  setIdeaName(example.ideaName);
                  setTargetCustomer(example.targetCustomer);
                  setMonetization(example.monetization);
                  setRegion("Indonesia");
                  setActiveExample(example.label);
                  composerRef.current?.focus();
                }}
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="glass-send-wrap">
            <span className="glass-count">{idea.length}/3000</span>
            <button
              type="submit"
              className="glass-send"
              disabled={busy || idea.trim().length < 50}
              aria-label={busy ? "Mengirim" : "Kaji ide"}
              title="Kaji ide (⌘/Ctrl+Enter)"
            >
              <SendIcon />
            </button>
          </div>
        </div>

        <details className="glass-optional">
          <summary>Detail opsional · boleh kosong</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <OptionalField
              id="ideaName"
              label="Nama ide"
              value={ideaName}
              onChange={setIdeaName}
              placeholder="KosPay"
            />
            <OptionalField
              id="targetCustomer"
              label="Target customer"
              value={targetCustomer}
              onChange={setTargetCustomer}
              placeholder="Pemilik kos 10–50 kamar"
            />
            <OptionalField
              id="monetization"
              label="Harga / monetisasi"
              value={monetization}
              onChange={setMonetization}
              placeholder="Rp 99.000/bulan"
            />
            <OptionalField
              id="region"
              label="Wilayah"
              value={region}
              onChange={setRegion}
              placeholder="Indonesia"
            />
            <OptionalField
              id="stage"
              label="Tahap"
              value={stage}
              onChange={setStage}
              placeholder="ide / MVP / sudah ada pelanggan"
            />
          </div>
        </details>
      </form>

      {status ? <p className="landing-status">{status}</p> : null}

      <HistoryList />
    </div>
  );
}

function HistoryList() {
  const [reports, setReports] = useState<ReportSummary[]>([]);

  useEffect(() => {
    void fetchReportHistory(getOwnerToken())
      .then(setReports)
      .catch(() => undefined);
  }, []);

  if (reports.length === 0) return null;

  return (
    <section id="riwayat" className="landing-history">
      <h2>Riwayat di perangkat ini</h2>
      {reports.map((report) => (
        <Link
          key={report.id}
          to="/reports/$reportId"
          params={{ reportId: report.id }}
        >
          <p className="text-sm font-medium">
            {report.ideaName ?? report.ideaText.slice(0, 80)}
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            {report.status}
            {report.overallScore != null ? ` · skor ${report.overallScore}` : ""}
            {report.verdict ? ` · ${report.verdict}` : ""}
          </p>
        </Link>
      ))}
    </section>
  );
}

function OptionalField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1 text-xs" htmlFor={id}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8h9M8.5 4.5 12.5 8l-4 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
