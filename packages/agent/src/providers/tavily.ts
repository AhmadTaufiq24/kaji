import { tavily } from "@tavily/core";

export function isTavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

export function tavilyClient() {
  return tavily({ apiKey: process.env.TAVILY_API_KEY });
}
