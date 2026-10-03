import { createParsedCompletion } from "@anvia/core";
import {
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";
import type { z } from "zod";
import type { CompletionModel } from "@anvia/core";
import { recordModelUsage } from "./usage.js";

export async function parsedCompletion<T>(
  name: string,
  model: CompletionModel,
  modelName: string,
  schema: z.ZodType<T>,
  options: { instructions: string; input: string; temperature?: number },
): Promise<T> {
  return startActiveObservation(
    name,
    async (generation) => {
      generation.update({
        model: modelName,
        input: [{ role: "user", content: options.input }],
      });

      const result = await createParsedCompletion(model, {
        schema,
        instructions: options.instructions,
        input: options.input,
        temperature: options.temperature ?? 0.2,
      });

      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      recordModelUsage(modelName, inputTokens, outputTokens);

      updateActiveObservation(
        {
          output: result.data,
          usageDetails: {
            input: inputTokens,
            output: outputTokens,
          },
        },
        { asType: "generation" },
      );

      return result.data;
    },
    { asType: "generation" },
  );
}
