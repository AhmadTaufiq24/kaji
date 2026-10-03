import {
  tracing,
  runValidationPipeline,
  IdeaRejectedError,
  SECTION_KEYS,
} from "@kaji/agent";
import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "./config/queue-connection.js";
import { prisma } from "./lib/prisma.js";
import {
  createRedisPublisher,
  reportChannel,
  type ReportProgressEvent,
} from "./lib/report-events.js";

const publisher = createRedisPublisher();

async function publish(reportId: string, event: ReportProgressEvent) {
  try {
    await publisher.publish(reportChannel(reportId), JSON.stringify(event));
  } catch {
    // UI falls back to polling if Redis pub/sub fails.
  }
}

export const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const reportId = job.data.reportId as string;
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { status: "running" },
    });

    try {
      const result = await runValidationPipeline({
        reportId,
        ideaText: report.ideaText,
        region: report.region,
        ideaName: report.ideaName,
        targetCustomer: report.targetCustomer,
        monetization: report.monetization,
        stage: report.stage,
        promptVersion: report.promptVersion,
        hooks: {
          onNormalized: async (idea) => {
            await prisma.report.update({
              where: { id: reportId },
              data: {
                normalizedIdea: idea,
                ideaName: report.ideaName ?? idea.oneLiner,
              },
            });
          },
          onSources: async (sources) => {
            await prisma.source.deleteMany({ where: { reportId } });
            if (sources.length === 0) return;
            await prisma.source.createMany({
              data: sources.map((source) => ({
                reportId,
                sectionKey: source.sectionKey,
                url: source.url,
                title: source.title,
                snippet: source.snippet,
              })),
            });
            await publish(reportId, { type: "sources" });
          },
          onSection: async (section) => {
            await prisma.reportSection.upsert({
              where: { reportId_key: { reportId, key: section.key } },
              create: {
                reportId,
                key: section.key,
                content: section.content,
                score: section.score,
                confidence: section.confidence,
                grounded: section.grounded,
              },
              update: {
                content: section.content,
                score: section.score,
                confidence: section.confidence,
                grounded: section.grounded,
              },
            });
            await publish(reportId, { type: "section", key: section.key });
          },
          onScored: async ({ overallScore, verdict }) => {
            await prisma.report.update({
              where: { id: reportId },
              data: { overallScore, verdict },
            });
            await publish(reportId, { type: "scored" });
          },
        },
      });

      const keys = new Set(result.sections.map((section) => section.key));
      const missing = SECTION_KEYS.some((key) => !keys.has(key));
      const status = result.partial || missing ? "partial" : "completed";

      await prisma.report.update({
        where: { id: reportId },
        data: {
          normalizedIdea: result.idea,
          ideaName: report.ideaName ?? result.idea.oneLiner,
          overallScore: result.overallScore,
          verdict: result.verdict,
          status,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.usage.costUsd,
          langfuseTraceId: result.traceId,
        },
      });
      await publish(reportId, { type: "done", status });
    } catch (error) {
      const message =
        error instanceof IdeaRejectedError
          ? error.reason
          : error instanceof Error
            ? error.message
            : "Pipeline failed";

      await prisma.report.update({
        where: { id: reportId },
        data: { status: "failed", verdict: message },
      });
      await publish(reportId, { type: "failed", status: "failed" });
      throw new Error(message);
    } finally {
      await tracing.flush();
    }
  },
  {
    connection,
    lockDuration: 180_000,
    stalledInterval: 60_000,
    concurrency: 2,
  },
);

worker.on("ready", () => {
  console.log(`Worker listening on queue "${QUEUE_NAME}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id} failed:`, error.message);
});
