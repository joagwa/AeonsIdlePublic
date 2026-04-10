/**
 * SaveMigrator — Versioned save-data migration pipeline.
 *
 * Each migration function transforms data from version N-1 → N.
 * Add new migration functions to the `migrations` map as the schema evolves.
 *
 * HOW TO ADD A NEW MIGRATION:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Bump CURRENT_VERSION (e.g. 1 → 2).
 * 2. Add a new entry in the `migrations` map keyed by the NEW version:
 *
 *      2(data) {
 *        // v1 → v2: describe what changed
 *        data.newField = data.newField ?? 'defaultValue';
 *        // Rename: data.newName = data.oldName; delete data.oldName;
 *        // Restructure: data.nested = { foo: data.flatFoo }; delete data.flatFoo;
 *        return data;
 *      },
 *
 * 3. The migrate() function automatically chains: v0→v1→v2→...→current.
 *    Old saves at ANY prior version will be stepped through each migration
 *    in order, so each function only needs to handle one version jump.
 *
 * 4. Test by exporting a save BEFORE the change, then importing it after.
 *
 * IMPORTANT: Never remove old migrations — a user could have a v0 save
 * and needs the full chain to reach the current version.
 * ─────────────────────────────────────────────────────────────────────
 */

const CURRENT_VERSION = 3;

/**
 * Map of version → migration function.
 * Key N transforms data from schema version N-1 to N.
 */
const migrations = {
  1(data) {
    // v0 → v1: ensure all expected top-level fields exist
    data.gameState     = data.gameState     ?? null;
    data.resourceStates = data.resourceStates ?? {};
    data.upgradeStates  = data.upgradeStates  ?? {};
    data.milestoneStates = data.milestoneStates ?? {};
    data.starStates     = data.starStates     ?? {};
    data.chronicleLog   = data.chronicleLog   ?? [];
    data.savedAt        = data.savedAt        ?? 0;
    return data;
  },
  2(data) {
    // v1 → v2: add rate/cap bonus persistence and cosmicEchoCount
    data.rateBonuses = data.rateBonuses ?? {};
    data.capBonuses  = data.capBonuses  ?? {};
    if (data.gameState) {
      data.gameState.cosmicEchoCount = data.gameState.cosmicEchoCount ?? 0;
    }
    return data;
  },
  3(data) {
    // v2 → v3: elemental fusion update — resource schema changed fundamentally
    // (heavyElements replaced by H/He/C/O/Fe + molecules). Save is incompatible.
    data._breakingReset = true;
    return data;
  },
};

/**
 * Apply all pending migrations to `data` and stamp it with CURRENT_VERSION.
 * Mutates and returns the data object.
 * @param {object} data — raw save payload
 * @returns {object}
 */
function migrate(data) {
  let version = data.schemaVersion ?? 0;

  while (version < CURRENT_VERSION) {
    version += 1;
    const fn = migrations[version];
    if (fn) {
      fn(data);
    }
  }

  data.schemaVersion = CURRENT_VERSION;
  return data;
}

export const SaveMigrator = Object.freeze({ CURRENT_VERSION, migrate });
