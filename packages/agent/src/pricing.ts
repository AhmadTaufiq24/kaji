export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** USD per 1M tokens (OpenAI list prices; override via env if needed). */
const DEFAULT_RATES: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
};

function rateFor(modelName: string) {
  const key = modelName.toLowerCase();
  const ordered = Object.entries(DEFAULT_RATES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [name, rate] of ordered) {
    if (key.includes(name)) return rate;
  }
  return { input: 0.4, output: 1.6 };
}

export function estimateCostUsd(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
) {
  const rate = rateFor(modelName);
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export function addUsage(
  target: TokenUsage,
  modelName: string,
  inputTokens: number,
  outputTokens: number,
) {
  target.inputTokens += inputTokens;
  target.outputTokens += outputTokens;
  target.costUsd += estimateCostUsd(modelName, inputTokens, outputTokens);
}

export const COST_BUDGET_USD = 0.15;
