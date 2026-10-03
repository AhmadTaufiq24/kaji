import Redis from "ioredis";
import { connection } from "../config/queue-connection.js";

function redisOptions() {
  return {
    ...connection,
    maxRetriesPerRequest: null as null,
  };
}

export function createRedisPublisher() {
  return new Redis(redisOptions());
}

export function createRedisSubscriber() {
  return new Redis(redisOptions());
}

export function reportChannel(reportId: string) {
  return `kaji:report:${reportId}`;
}

export type ReportProgressEvent = {
  type: "section" | "sources" | "scored" | "done" | "failed";
  key?: string;
  status?: string;
};
