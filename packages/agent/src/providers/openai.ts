import { OpenAIClient } from "@anvia/openai";

const openai = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
});

export const smallModel = openai.completionModel(
  process.env.OPENAI_SMALL_MODEL ?? "gpt-4.1-mini",
);

export const largeModel = openai.completionModel(
  process.env.OPENAI_MODEL ?? "gpt-4.1",
);

export const smallModelName =
  process.env.OPENAI_SMALL_MODEL ?? "gpt-4.1-mini";

export const largeModelName = process.env.OPENAI_MODEL ?? "gpt-4.1";
