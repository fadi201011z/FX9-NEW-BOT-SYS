/**
 * commandLoader.js — the single source of truth for command discovery.
 *
 * Every part of the bot that needs to know "which commands exist" goes through
 * here: the runtime handler loader, the global auto-registrar, the per-guild
 * registrar, and `npm run deploy`.
 *
 * Why this file exists
 * --------------------
 * Four separate hardcoded folder lists used to live in:
 *   src/index.js  ·  src/events/ready.js  ·  src/events/guildCreate.js  ·  src/deploy-commands.js
 * They had drifted apart. `ready.js` registered /announce but `index.js` never
 * loaded its handler, so Discord accepted the interaction and the bot silently
 * timed out ("The application did not respond"). `guildCreate.js` and
 * `deploy-commands.js` were both missing the notification folder.
 *
 * The fix is not a fifth list — it is removing the lists. Folders are discovered
 * from disk, so a new command folder can never be half-registered again.
 */

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const COMMANDS_ROOT = new URL('../commands/', import.meta.url);

/** Command folders, discovered from disk. Sorted so startup order is stable. */
export async function commandFolders() {
  const entries = await readdir(COMMANDS_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Import every command module under commands/.
 *
 * Returns [{ name, folder, file, mod }]. A module is a command only if it
 * exports `data`. Modules missing it are skipped silently — they are helpers.
 *
 * Node caches ES modules natively, so re-importing is cheap; the memo here just
 * avoids re-walking the directory tree on every dashboard request.
 */
let moduleCache = null;

export async function commandModules() {
  if (moduleCache) return moduleCache;

  const loaded = [];

  for (const folder of await commandFolders()) {
    const dirUrl = new URL(`${folder}/`, COMMANDS_ROOT);

    let files;
    try {
      files = (await readdir(dirUrl)).filter((file) => file.endsWith('.js')).sort();
    } catch {
      continue;
    }

    for (const file of files) {
      const mod = await import(pathToFileURL(new URL(file, dirUrl).href).href);
      if (!mod?.data) continue;
      loaded.push({ name: mod.data.name, folder, file, mod });
    }
  }

  moduleCache = loaded;
  return loaded;
}

/** Drop the memo. Only needed if commands are added to a running process. */
export function invalidateCommandModules() {
  moduleCache = null;
}

/**
 * Modules that declare `data` but no `execute`. Registering one of these on
 * Discord produces a command that is visible in the picker and answers nothing,
 * which is exactly the /announce failure. Callers log these instead of shipping
 * them.
 */
export function findUndispatchable(modules) {
  return modules
    .filter(({ mod }) => typeof mod.execute !== 'function')
    .map(({ name, folder }) => ({ name, folder }));
}

/**
 * Command payloads for a REST bulk-overwrite.
 *
 * Only fully-formed commands are included: `data` *and* `execute`. A command
 * that cannot be dispatched must not reach Discord.
 */
export async function commandPayloads() {
  const modules = await commandModules();
  return modules
    .filter(({ mod }) => typeof mod.execute === 'function')
    .map(({ mod }) => mod.data.toJSON());
}