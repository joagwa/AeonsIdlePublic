/**
 * SaveSystem — Serialisation, persistence, import/export, and offline-progress
 * handling for Aeons save data.
 */

import { SaveMigrator } from './SaveMigrator.js?v=6cd1d3d';

const STORAGE_KEY = 'aeons_save_v1';
const AUTO_SAVE_INTERVAL_MS = 60_000;
const MAX_OFFLINE_SECONDS = 86_400;
const MIN_OFFLINE_FOR_GAINS = 60;

export class SaveSystem {
  /** @type {ReturnType<typeof setInterval> | null} */
  #autoSaveTimer = null;

  /**
   * @param {import('./EventBus.js?v=6cd1d3d').EventBus} eventBus
   * @param {*} resourceManager
   * @param {*} upgradeSystem
   * @param {*} milestoneSystem
   * @param {*} starManager
   * @param {*} epochSystem
   * @param {object} gameState — mutable reference
   */
  constructor(eventBus, resourceManager, upgradeSystem, milestoneSystem, starManager, epochSystem, gameState, moteController) {
    this.eventBus = eventBus;
    this.resourceManager = resourceManager;
    this.upgradeSystem = upgradeSystem;
    this.milestoneSystem = milestoneSystem;
    this.starManager = starManager;
    this.epochSystem = epochSystem;
    this.gameState = gameState;
    this.moteController = moteController || null;
  }

  // ── Serialisation helpers ────────────────────────────────────────────

  /** Build the canonical save payload. */
  #buildSaveData() {
    return {
      schemaVersion: SaveMigrator.CURRENT_VERSION,
      savedAt: Date.now(),
      gameState: { ...this.gameState },
      resourceStates: this.resourceManager.getStates(),
      rateBonuses: this.resourceManager.getRateBonuses(),
      capBonuses: this.resourceManager.getCapBonuses(),
      upgradeStates: this.upgradeSystem.getStates(),
      milestoneStates: this.milestoneSystem.getStates(),
      starStates: this.starManager.getStates(),
      chronicleLog: this.milestoneSystem.getChronicleLog(),
      moteState: this.moteController ? this.moteController.getState() : null,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Persist current game state to localStorage.
   * @param {string} [source='auto']
   */
  save(source = 'auto') {
    try {
      const data = this.#buildSaveData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log(`[SaveSystem] Save completed (${source})`);
      this.eventBus.emit('save:completed', { source });
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.error('[SaveSystem] Storage quota exceeded');
        this.eventBus.emit('save:error', { reason: 'quota_exceeded' });
      } else if (err.name === 'SecurityError' || err.code === 18) {
        console.error('[SaveSystem] localStorage not available (private window or disabled)', err.message);
        this.eventBus.emit('save:error', { reason: 'security_error' });
      } else {
        console.error('[SaveSystem] Save failed:', err);
        throw err;
      }
    }
  }

  /**
   * Load game state from localStorage and apply offline progress.
   * @returns {boolean} true if a valid save was loaded
   */
  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        console.log('[SaveSystem] No save found in localStorage');
        return false;
      }

      console.log('[SaveSystem] Loading save from localStorage');
      const data = JSON.parse(raw);
      SaveMigrator.migrate(data);

      if (!data.gameState) {
        console.warn('[SaveSystem] Save data missing gameState');
        return false;
      }

      // Restore module states
      Object.assign(this.gameState, data.gameState);
      this.resourceManager.loadStates(data.resourceStates);
      this.resourceManager.loadRateBonuses(data.rateBonuses);
      this.resourceManager.loadCapBonuses(data.capBonuses);
      // Load canvas config BEFORE upgrades so that the renderer's canvasConfig.homeObject
      // is already set when upgrade:purchased fires for upg_gravitationalPull.
      await this.epochSystem.loadEpoch(this.gameState.epochId);
      this.upgradeSystem.loadStates(data.upgradeStates);
      this.milestoneSystem.loadStates(data.milestoneStates);
      this.starManager.loadStates(data.starStates);
      this.milestoneSystem.loadChronicleLog(data.chronicleLog);
      if (this.moteController && data.moteState) {
        this.moteController.loadState(data.moteState);
      }

      // Offline progress
      const elapsed = Math.max(0, (Date.now() - data.savedAt) / 1000);
      const capped = Math.min(elapsed, MAX_OFFLINE_SECONDS);
      if (capped > MIN_OFFLINE_FOR_GAINS) {
        const gains = this.resourceManager.applyOfflineGains(capped);
        this.eventBus.emit('save:offline_progress_applied', { elapsedSeconds: capped, gains });
      }

      console.log('[SaveSystem] Save loaded successfully');
      return true;
    } catch (err) {
      console.error('[SaveSystem] Failed to load save:', err);
      return false;
    }
  }

  /**
   * Export save data as a Base64-encoded string.
   * @returns {string}
   */
  export() {
    const data = this.#buildSaveData();
    return btoa(JSON.stringify(data));
  }

  /**
   * Import a Base64-encoded save string after validation.
   * Does NOT automatically apply the imported data — caller should
   * trigger a full load after a successful import.
   * @param {string} str
   * @returns {{ success: boolean, error?: string }}
   */
  import(str) {
    // 1. Valid Base64
    let json;
    try {
      json = atob(str);
    } catch {
      return { success: false, error: 'Invalid base64 encoding' };
    }

    // 2. Valid JSON
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return { success: false, error: 'Invalid JSON' };
    }

    // 3. schemaVersion within range
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SaveMigrator.CURRENT_VERSION) {
      return { success: false, error: 'Unsupported schema version' };
    }

    // 4. gameState non-null
    if (!data.gameState) {
      return { success: false, error: 'Missing gameState' };
    }

    // 5. epochId recognised
    if (!data.gameState.epochId || typeof data.gameState.epochId !== 'string') {
      return { success: false, error: 'Unknown or missing epochId' };
    }

    // 6. savedAt reasonable
    if (typeof data.savedAt !== 'number' || data.savedAt < 0) {
      return { success: false, error: 'Invalid savedAt timestamp' };
    }

    // 7. resource/upgrade/milestone states are objects
    if (
      typeof data.resourceStates !== 'object' || data.resourceStates === null ||
      typeof data.upgradeStates !== 'object' || data.upgradeStates === null ||
      typeof data.milestoneStates !== 'object' || data.milestoneStates === null
    ) {
      return { success: false, error: 'State fields must be objects' };
    }

    // 8. chronicleLog is an array
    if (!Array.isArray(data.chronicleLog)) {
      return { success: false, error: 'chronicleLog must be an array' };
    }

    // Persist the imported data for the next load() call
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      return { success: false, error: 'Failed to write to localStorage' };
    }

    return { success: true };
  }

  /**
   * Wipe saved data and reset all modules to their initial state.
   */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.resourceManager.reset();
    this.upgradeSystem.reset();
    this.milestoneSystem.reset();
    this.starManager.reset();
    this.epochSystem.reset();
  }

  /**
   * Start the 60-second auto-save interval.
   */
  startAutoSave() {
    this.stopAutoSave();
    this.#autoSaveTimer = setInterval(() => this.save('auto'), AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Stop the auto-save interval.
   */
  stopAutoSave() {
    if (this.#autoSaveTimer !== null) {
      clearInterval(this.#autoSaveTimer);
      this.#autoSaveTimer = null;
    }
  }
}
