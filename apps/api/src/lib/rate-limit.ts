const hits = new Map<string, number[]>();

/** Returns true when the caller is still under the limit. */
export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const oldest = recent[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000),
    );
    return { allowed: false as const, retryAfterSeconds };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true as const, retryAfterSeconds: 0 };
}

export function clientIp(forwardedFor: string | undefined) {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
