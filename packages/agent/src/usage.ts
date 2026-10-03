import { AsyncLocalStorage } from "node:async_hooks";
import { addUsage, emptyUsage, type TokenUsage } from "./pricing.js";

const store = new AsyncLocalStorage<TokenUsage>();

export function withUsageTracking<T>(fn: () => Promise<T>): Promise<{
  result: T;
  usage: TokenUsage;
}> {
  const usage = emptyUsage();
  return store.run(usage, async () => {
    const result = await fn();
    return {
      result,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: Math.round(usage.costUsd * 10_000) / 10_000,
      },
    };
  });
}

export function recordModelUsage(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
) {
  const usage = store.getStore();
  if (!usage) return;
  addUsage(usage, modelName, inputTokens, outputTokens);
}
