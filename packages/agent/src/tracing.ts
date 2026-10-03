import { langfuse } from "@anvia/langfuse";

/**
 * Starts the Langfuse OpenTelemetry exporter (via Anvia's adapter).
 * Import this module before any LLM work so spans are not lost.
 */
export const tracing = langfuse.create({
  environment:
    process.env.LANGFUSE_TRACING_ENVIRONMENT ??
    process.env.NODE_ENV ??
    "development",
  release: process.env.LANGFUSE_RELEASE ?? "kaji-mvp",
  serviceName: process.env.LANGFUSE_SERVICE_NAME ?? "kaji",
  redactInputs: "deep",
  redactOutputs: "deep",
});

export function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
  );
}
