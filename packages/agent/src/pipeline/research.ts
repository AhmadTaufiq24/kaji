import { startActiveObservation } from "@langfuse/tracing";
import { isTavilyConfigured, tavilyClient } from "../providers/tavily.js";
import type { NormalizedIdea } from "../schemas/normalized-idea.js";
import type { SectionKey } from "../constants.js";

export type ResearchSource = {
  sectionKey: SectionKey;
  url: string;
  title: string;
  snippet: string;
};

export type ResearchBrief = {
  grounded: boolean;
  sources: ResearchSource[];
  text: string;
};

export const EMPTY_RESEARCH_BRIEF: ResearchBrief = {
  grounded: true,
  sources: [],
  text: "No web research required for this section.",
};

const INCUMBENT_QUERIES: Array<{ test: RegExp; names: string[] }> = [
  { test: /\b(kos|kost|kosan)\b/i, names: ["Mamikos", "SuperKos"] },
  { test: /\b(pajak|faktur|ppn|e-faktur)\b/i, names: ["Klikpajak", "Jurnal"] },
  {
    test: /\b(klinik|rekam medis|e-resep|antrean dokter|antrian dokter)\b/i,
    names: ["Klinika", "cloudklinik.id"],
  },
  { test: /\b(hris|absensi|slip gaji|bpjs)\b/i, names: ["mekari.com", "talenta.co"] },
  { test: /\b(cpns|skd|kedinasan)\b/i, names: ["bimbel SKD", "Bimbel"] },
  { test: /\b(salon|cat rambut)\b/i, names: ["moka.co", "olsera.com"] },
  { test: /\b(gojek|grab|ojek online|ojol)\b/i, names: ["Gojek", "Grab"] },
  { test: /\b(instagram|tiktok)\b/i, names: ["Instagram", "TikTok"] },
  {
    test: /\b(marketplace|tokopedia|shopee)\b/i,
    names: ["Tokopedia", "Shopee"],
  },
];

function ideaBlurb(idea: NormalizedIdea) {
  return [
    `One-liner: ${idea.oneLiner}`,
    `Problem: ${idea.problem}`,
    `Solution: ${idea.solution}`,
    `Customer: ${idea.customer}`,
    `Monetization: ${idea.monetization}`,
    `Region: ${idea.region}`,
  ].join("\n");
}

function compactTopic(idea: NormalizedIdea) {
  return `${idea.oneLiner} ${idea.solution}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function haystack(idea: NormalizedIdea, rawText: string) {
  return [
    rawText,
    idea.oneLiner,
    idea.problem,
    idea.solution,
    idea.customer,
    idea.monetization,
  ].join("\n");
}

type SearchQuery = {
  query: string;
  sectionKey: SectionKey;
  local: boolean;
  brand?: string;
};

function brandQuery(name: string, region: string): SearchQuery {
  const isDomain = name.includes(".");
  return {
    query: isDomain
      ? `${name} harga OR pricing`
      : `"${name}" harga ${region}`,
    sectionKey: "competition",
    local: !isDomain,
    brand: name,
  };
}

function searchQueries(idea: NormalizedIdea, rawText: string): SearchQuery[] {
  const region = idea.region || "Indonesia";
  const topic = compactTopic(idea);
  const customer = idea.customer.slice(0, 48);
  const incumbent = INCUMBENT_QUERIES.find((row) =>
    row.test.test(haystack(idea, rawText)),
  );

  const competition: SearchQuery[] = incumbent
    ? incumbent.names.slice(0, 2).map((name) => brandQuery(name, region))
    : [
        {
          query: `${customer} software ${region} kompetitor`,
          sectionKey: "competition",
          local: true,
        },
      ];

  return [
    {
      query: `${topic} kompetitor aplikasi ${region} harga`,
      sectionKey: "competition",
      local: true,
    },
    ...competition,
    {
      query: `${topic} pasar ${region} ukuran`,
      sectionKey: "market",
      local: true,
    },
  ];
}

export async function researchMarketAndCompetition(
  idea: NormalizedIdea,
  rawText = "",
): Promise<ResearchBrief> {
  return startActiveObservation(
    "research-market-competition",
    async (span) => {
      if (!isTavilyConfigured()) {
        span.update({
          output: { grounded: false, reason: "TAVILY_API_KEY missing" },
        });
        return {
          grounded: false,
          sources: [],
          text: "No live web research. Tavily is not configured.",
        };
      }

      const queries = searchQueries(idea, rawText);
      span.update({ input: { queries: queries.map((item) => item.query) } });

      const client = tavilyClient();
      const indonesia = idea.region.toLowerCase().includes("indonesia");
      const searchHits = await Promise.all(
        queries.map(async ({ query, sectionKey, local, brand }) => {
          try {
            const response = await client.search(query, {
              maxResults: 6,
              searchDepth: "basic",
              country: local && indonesia ? "indonesia" : undefined,
            });
            const mapped = response.results.map((result) => ({
              sectionKey,
              url: result.url,
              title: result.title || result.url,
              snippet: result.content.slice(0, 400),
            })) satisfies ResearchSource[];
            if (!brand?.includes(".")) return mapped;
            const matched = mapped.filter((source) =>
              sourceMatchesBrand(source, brand),
            );
            return matched.length > 0 ? matched.slice(0, 4) : mapped.slice(0, 2);
          } catch (error) {
            span.update({
              metadata: {
                searchError:
                  error instanceof Error ? error.message : "search failed",
                query,
              },
            });
            return [] as ResearchSource[];
          }
        }),
      );

      let sources = dedupeSources(searchHits.flat());

      if (sources.length === 0) {
        try {
          const fallback = await client.search(
            `aplikasi ${compactTopic(idea)} ${idea.region || "Indonesia"}`,
            {
              maxResults: 6,
              searchDepth: "basic",
              country: indonesia ? "indonesia" : undefined,
            },
          );
          sources = dedupeSources(
            fallback.results.map((result) => ({
              sectionKey: "competition" as const,
              url: result.url,
              title: result.title || result.url,
              snippet: result.content.slice(0, 400),
            })),
          );
        } catch {
          // Keep empty; caller will mark ungrounded.
        }
      }

      const extractUrls = pickExtractUrls(sources);

      if (extractUrls.length > 0) {
        try {
          const extracted = await client.extract(extractUrls, {
            extractDepth: "basic",
            format: "text",
            timeout: 12,
          });
          for (const page of extracted.results) {
            const existing = sources.find((source) => source.url === page.url);
            const snippet = page.rawContent.slice(0, 900);
            if (existing) {
              existing.snippet = snippet;
              existing.title = page.title || existing.title;
            } else if (snippet) {
              sources.push({
                sectionKey: "competition",
                url: page.url,
                title: page.title || page.url,
                snippet,
              });
            }
          }
        } catch {
          // Search snippets remain if extract times out.
        }
      }
      const grounded = sources.length > 0;
      const brands = hostBrands(sources);
      const incumbents = mustNameIncumbents(idea, rawText);
      const priceHints = priceSignals(sources);
      const listings = sources
        .map(
          (source, index) =>
            `[${index + 1}] (${source.sectionKey}) ${source.title} — ${source.url}\n${source.snippet}`,
        )
        .join("\n\n");
      const text = [
        incumbents.length
          ? `Must-name incumbents (always list in competition, even if price unknown): ${incumbents.join(", ")}`
          : "",
        brands.length
          ? `Brands in source URLs (name these in the competition section): ${brands.join(", ")}`
          : "",
        priceHints.length
          ? [
              "Price signals (bind each price ONLY to the brand/URL on that same line; never reassign across brands):",
              ...priceHints.map((hint) => `- ${hint}`),
              "If a brand has no price signal line, competition section must say harga: tidak menemukan for that brand.",
            ].join("\n")
          : "No clear price signals extracted. For every competitor write harga: tidak menemukan unless the same-source snippet explicitly states a price.",
        listings,
      ]
        .filter(Boolean)
        .join("\n\n");

      span.update({
        output: {
          grounded,
          sourceCount: sources.length,
          queries: queries.map((item) => item.query),
        },
      });

      return {
        grounded,
        sources,
        text: grounded
          ? text
          : "Web search returned no usable sources. Write tidak menemukan instead of inventing competitors or market figures.",
      };
    },
    { asType: "retriever" },
  );
}

function mustNameIncumbents(idea: NormalizedIdea, rawText: string) {
  const match = INCUMBENT_QUERIES.find((row) =>
    row.test.test(haystack(idea, rawText)),
  );
  return match?.names.slice(0, 2) ?? [];
}

function hostBrands(sources: ResearchSource[]) {
  const seen = new Set<string>();
  const brands: string[] = [];
  for (const source of sources) {
    try {
      const host = new URL(source.url).hostname.replace(/^www\./i, "");
      const label = host.split(".")[0] ?? "";
      const key = label.toLowerCase();
      if (label.length < 3 || seen.has(key)) continue;
      if (/^(http|https|www|blog|id|com)$/i.test(label)) continue;
      seen.add(key);
      brands.push(label);
    } catch {
      // skip invalid urls
    }
  }
  return brands;
}

const PRICE_RE =
  /(?:Rp\.?\s?\d[\d.,]*\s*(?:ribu|juta|rb|jt)?(?:\s*\/\s*(?:bulan|bln|tahun|user|karyawan|seat))?|\bfree\b|\bgratis\b|\bfreemium\b)/gi;

function brandLabelForSource(source: ResearchSource) {
  try {
    const host = new URL(source.url).hostname.replace(/^www\./i, "");
    const label = host.split(".")[0] ?? "";
    if (label.length >= 3 && !/^(http|https|www|blog|id|com)$/i.test(label)) {
      return label;
    }
  } catch {
    // fall through
  }
  return (source.title || "sumber").slice(0, 40);
}

function priceSignals(sources: ResearchSource[]) {
  const hints: string[] = [];
  for (const source of sources) {
    if (source.sectionKey !== "competition") continue;
    const hay = `${source.title}\n${source.snippet}`;
    const matches = [...hay.matchAll(PRICE_RE)].map((match) =>
      match[0].replace(/\s+/g, " ").trim(),
    );
    if (matches.length === 0) continue;
    const unique = [...new Set(matches)].slice(0, 3);
    hints.push(
      `${brandLabelForSource(source)} [${source.url}]: ${unique.join("; ")}`,
    );
  }
  return hints.slice(0, 12);
}

function sourceMatchesBrand(source: ResearchSource, brand: string) {
  const hay = `${source.title} ${source.url}`.toLowerCase().replace(/[\s._-]+/g, "");
  const needle = brand.toLowerCase().replace(/[\s._-]+/g, "");
  if (hay.includes(needle)) return true;
  const host = brand.includes(".")
    ? brand.slice(0, brand.indexOf(".")).toLowerCase()
    : "";
  return host.length >= 4 && hay.includes(host);
}

function pickExtractUrls(sources: ResearchSource[]) {
  const ranked = sources
    .filter((source) => source.sectionKey === "competition")
    .filter((source) => extractPriority(source.url) < 8)
    .sort((a, b) => extractPriority(a.url) - extractPriority(b.url));
  return ranked.slice(0, 3).map((source) => source.url);
}

function extractPriority(url: string) {
  const lower = url.toLowerCase();
  if (
    lower.includes(".pdf") ||
    lower.includes("researchgate") ||
    lower.includes("/article/download") ||
    lower.includes(".ac.id")
  ) {
    return 9;
  }
  if (
    lower.includes("harga") ||
    lower.includes("pricing") ||
    lower.includes("price") ||
    lower.includes("app")
  ) {
    return 0;
  }
  return 1;
}

function dedupeSources(sources: ResearchSource[]) {
  const seen = new Set<string>();
  const unique: ResearchSource[] = [];
  for (const source of sources) {
    const key = `${source.sectionKey}:${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(source);
  }
  return unique;
}

export function formatIdea(idea: NormalizedIdea) {
  return ideaBlurb(idea);
}
