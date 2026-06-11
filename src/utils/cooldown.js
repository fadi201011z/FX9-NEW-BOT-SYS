// ── Global Cooldown ───────────────────────────────────────────────────
const DEFAULT_MS = 5_000;
const map = new Map();

function checkCooldown(userId, key, ms = DEFAULT_MS) {
  const k   = `${userId}:${key}`;
  const now = Date.now();
  if (map.has(k)) {
    const exp = map.get(k);
    if (now < exp) return Math.max(1, exp - now); // never return negative
  }
  map.set(k, now + Math.max(1, ms));
  setTimeout(() => map.delete(k), Math.max(1, ms));
  return 0;
}

export { checkCooldown };
