/**
 * Parse a human-readable duration string into milliseconds.
 * Examples: "10m" → 600000, "1h" → 3600000, "1d" → 86400000
 */
export function parseDuration(str) {
  if (!str) return null;

  const regex = /^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/i;
  const match = str.trim().match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit  = match[2].toLowerCase();

  const multipliers = {
    s: 1_000,
    sec: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    min: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000,
  };

  return value * (multipliers[unit] ?? null);
}

/** Format milliseconds into a readable string */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (days > 0)         return `${days}d ${hours % 24}h`;
  if (hours > 0)        return `${hours}h ${minutes % 60}m`;
  if (minutes > 0)      return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
