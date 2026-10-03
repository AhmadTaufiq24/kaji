import { Hono } from "hono";
import { GOLDEN_SET } from "@kaji/agent";
import { prisma } from "../../lib/prisma.js";

export const evalsRouter = new Hono()
  .get("/golden", (c) => {
    return c.json({
      count: GOLDEN_SET.length,
      cases: GOLDEN_SET.map((item) => ({
        id: item.id,
        band: item.band,
        expectedVerdicts: item.expectedVerdicts,
        requiredCompetitors: item.requiredCompetitors,
        expectReject: item.expectReject,
        ideaText: item.ideaText,
      })),
    });
  })
  .get("/", async (c) => {
    const runs = await prisma.evalRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return c.json({ runs });
  })
  .get("/:id", async (c) => {
    const run = await prisma.evalRun.findUnique({
      where: { id: c.req.param("id") },
    });
    if (!run) {
      return c.json({ error: "Eval run not found" }, 404);
    }
    return c.json(run);
  });
