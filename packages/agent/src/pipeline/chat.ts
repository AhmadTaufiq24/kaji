import "../tracing.js";
import {
  propagateAttributes,
  startActiveObservation,
} from "@langfuse/tracing";
import { parsedCompletion } from "../llm.js";
import { smallModel, smallModelName } from "../providers/openai.js";
import { isTavilyConfigured, tavilyClient } from "../providers/tavily.js";
import { SECTION_KEYS, type SectionKey } from "../constants.js";
import { overallScoreFrom, verdictFromScore } from "../scoring.js";
import { chatReplySchema } from "../schemas/chat.js";

export type ChatSectionInput = {
  key: string;
  score: number | null;
  body: string;
};

export type ChatSourceInput = {
  title: string;
  url: string;
  snippet: string;
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatDelta = {
  kind: "followup" | "whatif";
  overallScoreBefore: number | null;
  overallScoreAfter: number | null;
  verdictBefore: string | null;
  verdictAfter: string | null;
  changes: Array<{
    sectionKey: string;
    label: string;
    before: string;
    after: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
  }>;
};

export type ReportChatInput = {
  reportId: string;
  question: string;
  ideaText: string;
  language: "id" | "en";
  overallScore: number | null;
  verdict: string | null;
  sections: ChatSectionInput[];
  sources: ChatSourceInput[];
  history: ChatHistoryTurn[];
};

function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function shouldSearch(question: string) {
  return /kompetitor|competitor|harga|price|pasar|market|cac|ltv|pricing|mamikos/i.test(
    question,
  );
}

async function extraSearch(question: string): Promise<string> {
  if (!isTavilyConfigured() || !shouldSearch(question)) return "";
  try {
    const response = await tavilyClient().search(question, {
      maxResults: 3,
      searchDepth: "basic",
      country: "indonesia",
    });
    return response.results
      .map(
        (result) =>
          `${result.title} — ${result.url}\n${result.content.slice(0, 280)}`,
      )
      .join("\n\n");
  } catch {
    return "";
  }
}

export async function runReportChat(input: ReportChatInput): Promise<{
  answer: string;
  delta: ChatDelta;
}> {
  return startActiveObservation(
    "report-chat",
    async (span) => {
      span.update({
        input: { question: input.question },
        metadata: { reportId: input.reportId, feature: "report-chat" },
      });

      const liveResearch = await extraSearch(input.question);

      const result = await propagateAttributes(
        {
          sessionId: input.reportId,
          tags: ["mvp", "report-chat"],
          metadata: { reportId: input.reportId, feature: "report-chat" },
        },
        async () =>
          parsedCompletion(
            "generate-chat-reply",
            smallModel,
            smallModelName,
            chatReplySchema,
            {
              temperature: 0.3,
              instructions: `You are a skeptical startup analyst continuing a validation report.
Write the answer in ${input.language === "id" ? "Indonesian" : "English"}.
Use the report as ground truth. Do not invent competitor names or prices that are not in sources or live research.
If the user changes an assumption (price, segment, CAC, region), kind="whatif". Fill changes and scoreAdjustments for affected sections only. Do not claim the original report was edited.
If it is a clarifying question, kind="followup", empty changes and scoreAdjustments.
Keep answers concise. Stay critical, not a cheerleader.`,
              input: buildPrompt(input, liveResearch),
            },
          ),
      );

      const scores = new Map<SectionKey, number>();
      for (const section of input.sections) {
        if (section.score == null || !isSectionKey(section.key)) continue;
        scores.set(section.key, section.score);
      }
      if (result.kind === "whatif") {
        for (const adjustment of result.scoreAdjustments) {
          if (!isSectionKey(adjustment.sectionKey)) continue;
          scores.set(adjustment.sectionKey, adjustment.scoreAfter);
        }
      }

      const overallAfter =
        result.kind === "whatif"
          ? overallScoreFrom(
              [...scores.entries()].map(([key, score]) => ({ key, score })),
            )
          : input.overallScore;
      const verdictAfter =
        result.kind === "whatif" && overallAfter != null
          ? verdictFromScore(overallAfter)
          : input.verdict;

      const delta: ChatDelta = {
        kind: result.kind,
        overallScoreBefore: input.overallScore,
        overallScoreAfter: overallAfter,
        verdictBefore: input.verdict,
        verdictAfter: verdictAfter,
        changes: result.kind === "whatif" ? result.changes : [],
      };

      span.update({
        output: {
          kind: result.kind,
          overallScoreAfter: delta.overallScoreAfter,
          verdictAfter: delta.verdictAfter,
        },
      });

      return { answer: result.answer, delta };
    },
    { asType: "chain" },
  );
}

function buildPrompt(input: ReportChatInput, liveResearch: string) {
  const sections = input.sections
    .map((section) => {
      const body = section.body.slice(0, 420);
      return `## ${section.key} (score ${section.score ?? "n/a"})\n${body}`;
    })
    .join("\n\n");
  const sources = input.sources
    .slice(0, 12)
    .map((source) => `- ${source.title} ${source.url}`)
    .join("\n");
  const history = input.history
    .slice(-8)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  return [
    `Original idea:\n${input.ideaText}`,
    `Overall score: ${input.overallScore ?? "n/a"}. Verdict: ${input.verdict ?? "n/a"}.`,
    sections,
    `Sources:\n${sources || "(none)"}`,
    liveResearch ? `Live research:\n${liveResearch}` : "",
    history ? `Recent chat:\n${history}` : "",
    `User question:\n${input.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
