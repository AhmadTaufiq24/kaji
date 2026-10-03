import { tracing } from "../index.js";
import { runValidationPipeline } from "../pipeline/run-validation.js";

const ideaText =
  process.argv.slice(2).join(" ").trim() ||
  "Aplikasi langganan untuk pemilik kos: pengingat tagihan via WhatsApp, pencatatan pembayaran, laporan bulanan. Target pemilik kos 10–50 kamar di kota besar. Rp 99.000/bulan.";

const reportId = `smoke-${Date.now()}`;

const { idea, traceId } = await runValidationPipeline({
  reportId,
  ideaText,
  region: "Indonesia",
});

console.log(
  JSON.stringify(
    {
      reportId,
      oneLiner: idea.oneLiner,
      accepted: idea.accepted,
      traceId,
    },
    null,
    2,
  ),
);

await tracing.flush();
await tracing.shutdown();
