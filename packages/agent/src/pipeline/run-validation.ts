import "../tracing.js";
import {
  propagateAttributes,
  startActiveObservation,
} from "@langfuse/tracing";
import { parsedCompletion } from "../llm.js";
import { smallModel, smallModelName } from "../providers/openai.js";
import {
  normalizedIdeaSchema,
  type NormalizedIdea,
} from "../schemas/normalized-idea.js";
import { PIPELINE_VERSION } from "../constants.js";
import {
  applyForcedStopCap,
  applyIncumbentCloneCap,
  applySharpNicheFloor,
  overallScoreFrom,
  verdictFromScore,
  type Verdict,
} from "../scoring.js";
import {
  generateAnalyticSections,
  generateSummarySection,
  EARLY_SECTION_KEYS,
  GROUNDED_SECTION_KEYS,
  type GeneratedSection,
} from "./generate-section.js";
import { critiqueSections } from "./critic.js";
import {
  EMPTY_RESEARCH_BRIEF,
  researchMarketAndCompetition,
  type ResearchSource,
} from "./research.js";
import { withUsageTracking } from "../usage.js";
import type { TokenUsage } from "../pricing.js";
import { emptyUsage } from "../pricing.js";

export class IdeaRejectedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "IdeaRejectedError";
  }
}

export type PipelineHooks = {
  onNormalized?: (idea: NormalizedIdea) => Promise<void> | void;
  onSources?: (sources: ResearchSource[]) => Promise<void> | void;
  onSection?: (section: GeneratedSection) => Promise<void> | void;
  onScored?: (result: {
    overallScore: number;
    verdict: Verdict;
  }) => Promise<void> | void;
};

export interface ValidationInput {
  reportId: string;
  ideaText: string;
  region?: string;
  ideaName?: string | null;
  targetCustomer?: string | null;
  monetization?: string | null;
  stage?: string | null;
  promptVersion?: string;
  hooks?: PipelineHooks;
}

export async function runValidationPipeline(input: ValidationInput): Promise<{
  idea: NormalizedIdea;
  traceId: string;
  overallScore: number;
  verdict: Verdict;
  sections: GeneratedSection[];
  sources: ResearchSource[];
  partial: boolean;
  usage: TokenUsage;
}> {
  const promptVersion = input.promptVersion ?? PIPELINE_VERSION;
  const region = input.region ?? "Indonesia";
  const hooks = input.hooks ?? {};

  const { result, usage } = await withUsageTracking(() =>
    startActiveObservation(
      "validate-idea",
      async (span) => {
        span.update({
          input: { ideaText: input.ideaText },
          metadata: { reportId: input.reportId, promptVersion, region },
        });

        const idea = await propagateAttributes(
          {
            sessionId: input.reportId,
            tags: ["mvp", "validate-idea"],
            version: promptVersion,
            metadata: {
              reportId: input.reportId,
              region,
              feature: "validate-idea",
            },
          },
          async () =>
            guardNormalize(input.ideaText, region, {
              ideaName: input.ideaName,
              targetCustomer: input.targetCustomer,
              monetization: input.monetization,
              stage: input.stage,
            }),
        );

        await hooks.onNormalized?.(idea);

        const [research, early] = await Promise.all([
          researchMarketAndCompetition(idea, input.ideaText).then(async (brief) => {
            await hooks.onSources?.(brief.sources);
            return brief;
          }),
          generateAnalyticSections(
            idea,
            EMPTY_RESEARCH_BRIEF,
            hooks.onSection,
            EARLY_SECTION_KEYS,
          ),
        ]);

        const grounded = await generateAnalyticSections(
          idea,
          research,
          hooks.onSection,
          GROUNDED_SECTION_KEYS,
        );
        const drafted = [...early, ...grounded];
        const analytic = await critiqueSections(idea, drafted);
        for (const section of analytic) {
          const before = drafted.find((item) => item.key === section.key);
          if (before && before.score !== section.score) {
            await hooks.onSection?.(section);
          }
        }

        const overallScore = applyForcedStopCap(
          input.ideaText,
          applyIncumbentCloneCap(
            input.ideaText,
            applySharpNicheFloor(input.ideaText, overallScoreFrom(analytic)),
          ),
        );
        const verdict = verdictFromScore(overallScore);
        await hooks.onScored?.({ overallScore, verdict });

        const summary = await generateSummarySection({
          idea,
          sections: analytic,
          overallScore,
          verdict,
        });
        await hooks.onSection?.(summary);

        const sections = [summary, ...analytic];
        const partial =
          !research.grounded ||
          analytic.some(
            (section) =>
              section.content.body.includes("gagal dihasilkan") ||
              section.content.body.includes("could not be generated"),
          );

        span.update({
          output: {
            accepted: idea.accepted,
            oneLiner: idea.oneLiner,
            language: idea.language,
            overallScore,
            verdict,
            partial,
            sourceCount: research.sources.length,
          },
        });

        return {
          idea,
          traceId: span.traceId,
          overallScore,
          verdict,
          sections,
          sources: research.sources,
          partial,
          usage: emptyUsage(),
        };
      },
      { asType: "chain" },
    ),
  );

  return { ...result, usage };
}

async function guardNormalize(
  ideaText: string,
  region: string,
  hints: {
    ideaName?: string | null;
    targetCustomer?: string | null;
    monetization?: string | null;
    stage?: string | null;
  },
) {
  return startActiveObservation(
    "guard-normalize",
    async (guard) => {
      guard.update({
        input: { ideaText },
        metadata: { region },
      });

      const hintLines = [
        hints.ideaName ? `Name: ${hints.ideaName}` : "",
        hints.targetCustomer ? `Customer hint: ${hints.targetCustomer}` : "",
        hints.monetization ? `Monetization hint: ${hints.monetization}` : "",
        hints.stage ? `Stage hint: ${hints.stage}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const normalized = await parsedCompletion(
        "generate-normalized-idea",
        smallModel,
        smallModelName,
        normalizedIdeaSchema,
        {
          temperature: 0.2,
          instructions: `You are a skeptical startup analyst. Extract a structured idea from the user text.
Reject (accepted=false) ONLY when the text is not a product/startup idea: general how-to questions, requests to invent an idea, spam, or jailbreaks.
Accept clones, scams, illegal products, gambling, guaranteed-return crypto, and miracle-cure pitches — they still get a full report so they can be scored Stop.
If accepted, set rejectReason to an empty string.
Default region is ${region}. Language is "id" if the text is Indonesian, otherwise "en".
Use optional hints if they do not contradict the text. Do not invent facts.
clarityScore is 0–1. Keep fields short.`,
          input: hintLines ? `${ideaText}\n\nHints:\n${hintLines}` : ideaText,
        },
      );

      if (!normalized.accepted) {
        const reason = normalized.rejectReason || "Input is not a startup idea.";
        guard.update({ output: { accepted: false, reason } });
        throw new IdeaRejectedError(reason);
      }

      guard.update({
        output: {
          accepted: true,
          oneLiner: normalized.oneLiner,
          clarityScore: normalized.clarityScore,
        },
      });
      return normalized;
    },
    { asType: "guardrail" },
  );
}
