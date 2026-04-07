/**
 * SaveMigrator — Versioned save-data migration pipeline.
 *
 * Each migration function transforms data from version N-1 → N.
 * Add new migration functions to the `migrations` map as the schema evolves.
 */

const CURRENT_VERSION = 1;

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
