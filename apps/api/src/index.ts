import { tracing, isLangfuseConfigured } from "@kaji/agent";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prisma } from "./lib/prisma.js";
import { reportsRouter } from "./modules/reports/router.js";
import { evalsRouter } from "./modules/evals/router.js";

const app = new Hono()
  .use(cors())
  .get("/health", async (c) => {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({
      ok: true,
      service: "kaji-api",
      langfuse: isLangfuseConfigured(),
    });
  })
  .route("/api/reports", reportsRouter)
  .route("/api/evals", evalsRouter);

const port = Number(process.env.PORT ?? 8000);

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`Kaji API on http://localhost:${info.port}`);
  },
);

async function shutdown() {
  await tracing.flush();
  await tracing.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
