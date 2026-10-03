export const OWNER_KEY = "kaji-owner-token";

export function getOwnerToken() {
  const existing = localStorage.getItem(OWNER_KEY);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(OWNER_KEY, token);
  return token;
}

export function peekOwnerToken() {
  return localStorage.getItem(OWNER_KEY);
}
