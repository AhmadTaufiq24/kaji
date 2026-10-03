import type { ConnectionOptions } from "bullmq";

export const QUEUE_NAME = "reports";

function connectionFromUrl(raw: string): ConnectionOptions {
  const url = new URL(raw);
  const options: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === "rediss:") options.tls = {};
  return options;
}

export const connection: ConnectionOptions = process.env.REDIS_URL
  ? connectionFromUrl(process.env.REDIS_URL)
  : {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 16379),
      maxRetriesPerRequest: null,
    };
