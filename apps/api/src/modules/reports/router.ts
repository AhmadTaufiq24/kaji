import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  PIPELINE_VERSION,
  runReportChat,
  tracing,
} from "@kaji/agent";
import { reportQueue } from "../../config/queue.js";
import { prisma } from "../../lib/prisma.js";
import {
  createRedisSubscriber,
  reportChannel,
} from "../../lib/report-events.js";
import { allowRequest, clientIp } from "../../lib/rate-limit.js";
import { buildReportPdf } from "../../lib/report-pdf.js";

const HOUR_MS = 60 * 60 * 1000;

const SECTION_TITLES: Record<string, string> = {
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

const SECTION_ORDER = [
  "summary",
  "problem",
  "customer",
  "market",
  "competition",
  "businessModel",
  "gtm",
  "risk",
  "assumptions",
];

const createReportSchema = z.object({
  ideaText: z.string().min(50).max(3000),
  ideaName: z.string().max(120).optional(),
  targetCustomer: z.string().max(240).optional(),
  monetization: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  stage: z.string().max(40).optional(),
  ownerToken: z.string().min(8).max(64),
});

const chatSchema = z.object({
  content: z.string().min(4).max(2000),
  ownerToken: z.string().min(8).max(64),
});

function sectionBody(content: unknown) {
  if (!content || typeof content !== "object") return "";
  const body = (content as { body?: unknown }).body;
  return typeof body === "string" ? body : "";
}

async function loadAuthorizedReport(id: string, ownerToken?: string | null) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { key: "asc" } },
      sources: { orderBy: { accessedAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) return null;
  const isOwner = ownerToken === report.ownerToken;
  if (!report.isPublic && !isOwner) return null;
  return { report, isOwner };
}

export const reportsRouter = new Hono()
  .post("/", zValidator("json", createReportSchema), async (c) => {
    const body = c.req.valid("json");
    const limit = allowRequest(
      `report:${clientIp(c.req.header("x-forwarded-for"))}`,
      5,
      HOUR_MS,
    );
    if (!limit.allowed) {
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json(
        { error: "Terlalu banyak laporan. Coba lagi dalam satu jam." },
        429,
      );
    }

    const report = await prisma.report.create({
      data: {
        ownerToken: body.ownerToken,
        ideaText: body.ideaText,
        ideaName: body.ideaName,
        targetCustomer: body.targetCustomer,
        monetization: body.monetization,
        region: body.region ?? "Indonesia",
        stage: body.stage,
        status: "queued",
        promptVersion: PIPELINE_VERSION,
      },
    });

    await reportQueue.add(
      "validate-idea",
      { reportId: report.id },
      { jobId: report.id, attempts: 1 },
    );

    return c.json({ reportId: report.id, status: report.status }, 201);
  })
  .get("/", async (c) => {
    const ownerToken = c.req.query("ownerToken");
    if (!ownerToken) {
      return c.json({ error: "ownerToken is required" }, 400);
    }

    const reports = await prisma.report.findMany({
      where: { ownerToken },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        ideaName: true,
        ideaText: true,
        status: true,
        verdict: true,
        overallScore: true,
        costUsd: true,
        createdAt: true,
      },
    });

    return c.json({ reports });
  })
  .get("/:id/events", async (c) => {
    const id = c.req.param("id");
    const authorized = await loadAuthorizedReport(id, c.req.query("ownerToken"));
    if (!authorized) {
      return c.json({ error: "Report not found" }, 404);
    }

    const subscriber = createRedisSubscriber();
    const channel = reportChannel(id);

    return streamSSE(c, async (stream) => {
      let closed = false;
      const onMessage = async (_channel: string, message: string) => {
        if (closed) return;
        try {
          await stream.writeSSE({ event: "progress", data: message });
        } catch {
          closed = true;
        }
      };

      await subscriber.subscribe(channel);
      subscriber.on("message", onMessage);
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify({ type: "hello", status: authorized.report.status }),
      });

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {
          closed = true;
        });
      }, 15000);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          closed = true;
          resolve();
        });
        const check = setInterval(() => {
          if (closed) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });

      clearInterval(heartbeat);
      subscriber.off("message", onMessage);
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    });
  })
  .get("/:id/pdf", async (c) => {
    const id = c.req.param("id");
    const authorized = await loadAuthorizedReport(id, c.req.query("ownerToken"));
    if (!authorized) {
      return c.json({ error: "Report not found" }, 404);
    }
    const { report } = authorized;
    if (report.status !== "completed" && report.status !== "partial") {
      return c.json({ error: "Report is not ready" }, 409);
    }

    const byKey = new Map(report.sections.map((section) => [section.key, section]));
    const pdf = buildReportPdf({
      title: report.ideaName || "Laporan validasi",
      verdict: report.verdict,
      score: report.overallScore,
      costUsd: report.costUsd,
      ideaText: report.ideaText,
      generatedAt: report.createdAt
        ? new Date(report.createdAt).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null,
      sections: SECTION_ORDER.flatMap((key) => {
        const section = byKey.get(key);
        if (!section) return [];
        return [
          {
            key,
            title: SECTION_TITLES[key] ?? key,
            score: section.score,
            body: sectionBody(section.content),
          },
        ];
      }),
      sources: report.sources.map((source) => ({
        title: source.title,
        url: source.url,
      })),
    });

    const filename = `kaji-${id}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  })
  .post(
    "/:id/share",
    zValidator(
      "json",
      z.object({ ownerToken: z.string().min(8).max(64) }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const report = await prisma.report.findUnique({
        where: { id: c.req.param("id") },
      });
      if (!report) {
        return c.json({ error: "Report not found" }, 404);
      }
      if (report.ownerToken !== body.ownerToken) {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (report.status !== "completed" && report.status !== "partial") {
        return c.json({ error: "Report is not ready" }, 409);
      }

      const updated = await prisma.report.update({
        where: { id: report.id },
        data: { isPublic: true },
      });

      return c.json({ isPublic: updated.isPublic });
    },
  )
  .post("/:id/messages", zValidator("json", chatSchema), async (c) => {
    const reportId = c.req.param("id");
    const body = c.req.valid("json");
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        sections: true,
        sources: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!report) {
      return c.json({ error: "Report not found" }, 404);
    }
    if (report.ownerToken !== body.ownerToken) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (report.status !== "completed" && report.status !== "partial") {
      return c.json({ error: "Report is not ready" }, 409);
    }

    const chatLimit = allowRequest(
      `chat:${clientIp(c.req.header("x-forwarded-for"))}`,
      30,
      HOUR_MS,
    );
    if (!chatLimit.allowed) {
      c.header("Retry-After", String(chatLimit.retryAfterSeconds));
      return c.json(
        { error: "Terlalu banyak pertanyaan. Coba lagi dalam satu jam." },
        429,
      );
    }

    await prisma.chatMessage.create({
      data: { reportId, role: "user", content: body.content },
    });

    try {
      const idea =
        report.normalizedIdea &&
        typeof report.normalizedIdea === "object" &&
        "language" in report.normalizedIdea
          ? (report.normalizedIdea as { language?: "id" | "en" })
          : null;

      const { answer, delta } = await runReportChat({
        reportId,
        question: body.content,
        ideaText: report.ideaText,
        language: idea?.language === "en" ? "en" : "id",
        overallScore: report.overallScore,
        verdict: report.verdict,
        sections: report.sections.map((section) => ({
          key: section.key,
          score: section.score,
          body: sectionBody(section.content),
        })),
        sources: report.sources.map((source) => ({
          title: source.title ?? source.url,
          url: source.url,
          snippet: source.snippet ?? "",
        })),
        history: report.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      const saved = await prisma.chatMessage.create({
        data: {
          reportId,
          role: "assistant",
          content: answer,
          delta,
        },
      });

      return c.json({
        id: saved.id,
        role: saved.role,
        content: saved.content,
        delta: saved.delta,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat failed";
      return c.json({ error: message }, 500);
    } finally {
      await tracing.flush();
    }
  })
  .get("/:id", async (c) => {
    const authorized = await loadAuthorizedReport(
      c.req.param("id"),
      c.req.query("ownerToken"),
    );
    if (!authorized) {
      return c.json({ error: "Report not found" }, 404);
    }

    const { report, isOwner } = authorized;
    const { ownerToken: _ownerToken, ...rest } = report;
    return c.json({
      ...rest,
      isOwner,
      messages: isOwner ? rest.messages : [],
    });
  });
