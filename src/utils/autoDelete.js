// ── Auto-Delete Utility ───────────────────────────────────────────────
// Deletes a Discord message after the specified delay.
// Safe: silently ignores if message is already deleted or not deletable.

export default function autoDelete(msg, seconds = 20) {
  if (!msg) return;
  setTimeout(() => {
    if (msg.deletable) msg.delete().catch(() => {});
  }, seconds * 1_000);
};
