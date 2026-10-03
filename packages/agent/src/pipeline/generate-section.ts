import type { SectionKey } from "../constants.js";
import { parsedCompletion } from "../llm.js";
import { smallModel, smallModelName } from "../providers/openai.js";
import {
  sectionDraftSchema,
  type SectionDraft,
} from "../schemas/section.js";
import type { NormalizedIdea } from "../schemas/normalized-idea.js";
import { applyGroundingCap } from "../scoring.js";
import type { ResearchBrief } from "./research.js";
import { formatIdea } from "./research.js";

export type GeneratedSection = {
  key: SectionKey;
  content: {
    body: string;
    rationale: string;
    citations: number[];
    market?: SectionDraft["market"];
    assumptions?: SectionDraft["assumptions"];
  };
  score: number;
  confidence: "low" | "medium" | "high";
  grounded: boolean;
};

const ANALYTIC_KEYS = [
  "problem",
  "customer",
  "market",
  "competition",
  "businessModel",
  "gtm",
  "risk",
  "assumptions",
] as const satisfies Exclude<SectionKey, "summary">[];

export const EARLY_SECTION_KEYS = [
  "problem",
  "customer",
  "businessModel",
  "gtm",
  "risk",
  "assumptions",
] as const satisfies ReadonlyArray<(typeof ANALYTIC_KEYS)[number]>;

export const GROUNDED_SECTION_KEYS = [
  "market",
  "competition",
] as const satisfies ReadonlyArray<(typeof ANALYTIC_KEYS)[number]>;

const LENGTH: Record<(typeof ANALYTIC_KEYS)[number], string> = {
  problem: "Body max ~90 words / 2 short paragraphs.",
  customer: "Body max ~80 words / 2 short paragraphs.",
  market:
    "Body max ~70 words: only interpret the ranges. Put TAM/SAM/SOM numbers in the market field, not as a long essay.",
  competition:
    "Body max ~140 words. List at most 4 competitors (one line each), then 1 sentence on moat/gap and 1 on substitutes.",
  businessModel: "Body max ~100 words. Prefer numbers over prose.",
  gtm: "Body max ~90 words. Name 1–2 channels only.",
  risk: "Body max ~110 words. 4–5 risks as one-line bullets, deadliest first.",
  assumptions:
    "Body max ~40 words (fatal themes only). Put all experiment detail in the assumptions array — keep each assumption/test/successMetric under ~25 words.",
};

const TASK: Record<(typeof ANALYTIC_KEYS)[number], string> = {
  problem:
    "Masalah & solusi: seberapa nyata dan menyakitkan masalahnya, apakah solusi ini benar-benar mengatasinya. Sebut 1 kelemahan solusi yang paling fatal.",
  customer:
    "Target customer: seberapa tajam segmennya, kemampuan bayar, akses. Tolak customer 'semua orang'. Sebut siapa yang BUKAN target.",
  market:
    "Pasar: TAM/SAM/SOM sebagai RENTANG dengan asumsi. Isi field market. Jika sumber tidak mendukung angka, tulis tidak menemukan dan confidence low. Jangan mengarang.",
  competition: [
    "Kompetitor & diferensiasi — akurat lebih penting daripada lengkap.",
    "Setiap kompetitor SATU baris: `Nama (url) — harga: … [n]`.",
    "Harga HANYA dari price signal / snippet sumber merek yang sama (URL/host cocok). Jangan pindahkan harga merek A ke merek B.",
    "Jika harga tidak ada di sumber merek itu: `harga: tidak menemukan` — jangan menebak dari merek lain atau pengetahuan umum.",
    "Wajib sebut SEMUA 'Must-name incumbents' dari research brief, plus merek di judul/URL sumber (contoh mamikos.com → Mamikos).",
    "Akhiri dengan substitusi (spreadsheet, WhatsApp, manual). Jangan mengarang merek di luar incumbents/sumber.",
  ].join(" "),
  businessModel:
    "Model bisnis & pricing: harga, tebakan CAC vs LTV, rasio kasar. Keras pada harga yang tidak didukung willingness-to-pay vs alternatif gratis/lebih murah.",
  gtm: "Go-to-market: 1–2 saluran konkret di kota/wilayah ide, tebakan CAC IDR, 1 alasan saluran itu bisa gagal.",
  risk: "Risiko: 4–5 terbesar, urut mematikan. Sertakan incumbent/distribusi bila relevan.",
  assumptions:
    "Asumsi kritis & eksperimen: 5–8 asumsi, fatal dulu. Setiap item: metode bernama (wawancara, landing page, WhatsApp), angka orang/unit, metrik sukses numerik, hari, biaya IDR. Isi field assumptions.",
};

export async function generateAnalyticSections(
  idea: NormalizedIdea,
  research: ResearchBrief,
  onSection?: (section: GeneratedSection) => Promise<void> | void,
  keys: readonly (typeof ANALYTIC_KEYS)[number][] = ANALYTIC_KEYS,
): Promise<GeneratedSection[]> {
  return mapPool(keys, keys.length, async (key) => {
    const section = await generateAnalyticSection(key, idea, research);
    await onSection?.(section);
    return section;
  });
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function sectionInstructions(key: (typeof ANALYTIC_KEYS)[number], language: string) {
  const extra =
    key === "assumptions"
      ? "Return 5-8 items in assumptions, fatal first. Set market to null."
      : key === "market"
        ? "Always fill market.tam/sam/som as ranges plus assumptions. Set assumptions to an empty array."
        : "Set market to null and assumptions to an empty array.";

  return [
    "You are a skeptical startup analyst, not a cheerleader.",
    `Write the "${key}" section in ${language}.`,
    TASK[key],
    LENGTH[key],
    "Be dense and specific. No throat-clearing, no restating the idea, no filler adjectives.",
    "Score 0-100. Clone of a national consumer app, scam, or 'AI does everything' stays 20-45. A sharp Indonesian B2B niche with a named buyer and price should score problem/customer 58-72 even if the market is crowded. Crowded competition is 38-52, not 20. 80+ needs strong evidence.",
    'Never use generic phrases like "pasar yang besar dan berkembang".',
    "Cite sources by 1-based index from the research brief. If a claim is not in sources, say tidak menemukan instead of inventing.",
    "Prefer proper nouns, Indonesian cities, IDR amounts, and numeric tests over adjectives.",
    extra,
  ].join("\n");
}

async function generateAnalyticSection(
  key: (typeof ANALYTIC_KEYS)[number],
  idea: NormalizedIdea,
  research: ResearchBrief,
): Promise<GeneratedSection> {
  const language = idea.language === "id" ? "Indonesian" : "English";
  const needsSources = key === "market" || key === "competition";
  const grounded = needsSources ? research.grounded : true;

  try {
    const draft = await parsedCompletion(
      `generate-section-${key}`,
      smallModel,
      smallModelName,
      sectionDraftSchema,
      {
        temperature: 0.3,
        instructions: sectionInstructions(key, language),
        input: [formatIdea(idea), "", "Research brief:", research.text].join("\n"),
      },
    );

    const score = applyGroundingCap(key, draft.score, grounded);
    const assumptions =
      key === "assumptions"
        ? [...draft.assumptions].sort((a, b) => Number(b.fatal) - Number(a.fatal))
        : undefined;

    return {
      key,
      content: {
        body: draft.body,
        rationale: draft.rationale,
        citations: draft.citations ?? [],
        market: key === "market" ? (draft.market ?? undefined) : undefined,
        assumptions,
      },
      score,
      confidence: grounded ? draft.confidence : "low",
      grounded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation failed";
    return {
      key,
      content: {
        body:
          idea.language === "id"
            ? "Bagian ini gagal dihasilkan."
            : "This section could not be generated.",
        rationale: message,
        citations: [],
      },
      score: applyGroundingCap(key, 40, grounded),
      confidence: "low",
      grounded: needsSources ? false : grounded,
    };
  }
}

export async function generateSummarySection(input: {
  idea: NormalizedIdea;
  sections: GeneratedSection[];
  overallScore: number;
  verdict: string;
}): Promise<GeneratedSection> {
  const language = input.idea.language === "id" ? "Indonesian" : "English";
  const scores = input.sections
    .map((section) => `${section.key}: ${section.score} (${section.confidence})`)
    .join("\n");

  try {
    const draft = await parsedCompletion(
      "generate-section-summary",
      smallModel,
      smallModelName,
      sectionDraftSchema,
      {
        temperature: 0.2,
        instructions: [
          "You are a skeptical startup analyst.",
          `Write the summary and verdict section in ${language}.`,
          `The overall score is ${input.overallScore}/100. The verdict is already decided: ${input.verdict}.`,
          "Do not change the verdict.",
          "Body max ~80 words, exactly 3 short paragraphs: (1) verdict in plain language, (2) the two weakest dimensions with scores, (3) the single most important test this week.",
          "No fluff. No repeating the idea verbatim.",
          `Score field must equal ${input.overallScore}.`,
          "Set market to null and assumptions to an empty array.",
        ].join("\n"),
        input: [formatIdea(input.idea), "", "Section scores:", scores].join("\n"),
      },
    );

    return {
      key: "summary",
      content: {
        body: draft.body,
        rationale: draft.rationale,
        citations: draft.citations ?? [],
      },
      score: input.overallScore,
      confidence: draft.confidence,
      grounded: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation failed";
    return {
      key: "summary",
      content: {
        body:
          input.idea.language === "id"
            ? `Verdict: ${input.verdict}. Skor ${input.overallScore}/100.`
            : `Verdict: ${input.verdict}. Score ${input.overallScore}/100.`,
        rationale: message,
        citations: [],
      },
      score: input.overallScore,
      confidence: "medium",
      grounded: true,
    };
  }
}
