import { tracing, evaluateGoldenSet, PIPELINE_VERSION } from "@kaji/agent";
import { prisma } from "../lib/prisma.js";

const args = new Map<string, string>();
for (const part of process.argv.slice(2)) {
  const [key, value] = part.replace(/^--/, "").split("=");
  args.set(key, value ?? "true");
}

const limit = args.has("limit") ? Number(args.get("limit")) : 2;
const judge = args.get("judge") !== "false";
const ids = args.get("ids")?.split(",").filter(Boolean);

const result = await evaluateGoldenSet({
  limit: Number.isFinite(limit) ? limit : 2,
  judge,
  ids,
});

const saved = await prisma.evalRun.create({
  data: {
    promptVersion: result.promptVersion || PIPELINE_VERSION,
    results: result,
  },
});

console.log(
  JSON.stringify(
    {
      evalRunId: saved.id,
      promptVersion: saved.promptVersion,
      summary: result.summary,
      cases: result.cases.map((item) => ({
        id: item.id,
        passed: item.passed,
        verdict: item.verdict,
        elapsedMs: item.elapsedMs,
        costUsd: item.costUsd,
      })),
    },
    null,
    2,
  ),
);

await tracing.flush();
await tracing.shutdown();
