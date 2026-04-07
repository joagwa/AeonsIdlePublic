/**
 * EpochSystem — Manages epoch lifecycle: loading data, coordinating
 * transitions between epochs, and awarding residual bonuses.
 */

export class EpochSystem {
  /** @type {import('../core/EventBus.js').EventBus} */
  #eventBus;
  /** @type {import('./ResourceManager.js').ResourceManager} */
  #resourceManager;
  /** @type {import('./UpgradeSystem.js').UpgradeSystem} */
  #upgradeSystem;
  /** @type {import('./MilestoneSystem.js').MilestoneSystem} */
  #milestoneSystem;
  /** @type {import('./StarManager.js').StarManager} */
  #starManager;
  /** @type {object} mutable game-wide state reference */
  #gameState;
  /** @type {object|null} current epoch configuration */
  #currentConfig = null;
  /** @type {Map<string, object>} cached epoch configs keyed by epochId */
  #epochRegistry = new Map();

  /**
   * @param {import('../core/EventBus.js').EventBus} EventBus
   * @param {import('./ResourceManager.js').ResourceManager} resourceManager
   * @param {import('./UpgradeSystem.js').UpgradeSystem} upgradeSystem
   * @param {import('./MilestoneSystem.js').MilestoneSystem} milestoneSystem
   * @param {import('./StarManager.js').StarManager} starManager
   * @param {object} gameState — mutable reference
   */
  constructor(EventBus, resourceManager, upgradeSystem, milestoneSystem, starManager, gameState) {
    this.#eventBus = EventBus;
    this.#resourceManager = resourceManager;
    this.#upgradeSystem = upgradeSystem;
    this.#milestoneSystem = milestoneSystem;
    this.#starManager = starManager;
    this.#gameState = gameState;
  }

  // ── Epoch loading ─────────────────────────────────────────────────────

  /**
   * Dynamically import epoch data files, load definitions into all
   * subsystems, and emit the transition-complete event.
   *
   * Does NOT reset systems — callers (transition(), SaveSystem.reset())
   * handle resets explicitly so that save-loading can restore states
   * before definitions are layered on top.
   *
   * @param {string} epochId
   */
  async loadEpoch(epochId) {
    let config;
    let canvasConfig;

    if (this.#epochRegistry.has(epochId)) {
      const cached = this.#epochRegistry.get(epochId);
      config = cached.config;
      canvasConfig = cached.canvasConfig;
    } else {
      try {
        if (epochId === 'epoch1') {
          const [dataModule, canvasModule] = await Promise.all([
            import('../data/epoch1.js'),
            import('../data/epoch1-canvas.js'),
          ]);
          config = dataModule.epoch1Config;
          canvasConfig = { ...canvasModule.epoch1CanvasConfig, visualThresholds: canvasModule.visualThresholds || null };
        } else {
          // Future epochs: attempt convention-based import
          console.warn(`[EpochSystem] Unknown epoch "${epochId}", falling back to epoch1`);
          return this.loadEpoch('epoch1');
        }
      } catch (err) {
        console.error(`[EpochSystem] Failed to load epoch "${epochId}":`, err);
        return;
      }

      this.#epochRegistry.set(epochId, { config, canvasConfig });
    }

    this.#currentConfig = config;
    this.#gameState.epochId = epochId;

    // Load definitions into all subsystems
    this.#resourceManager.loadDefinitions(config.resources);
    this.#upgradeSystem.loadDefinitions(config.upgrades);
    this.#milestoneSystem.loadDefinitions(config.milestones);

    this.#eventBus.emit('epoch:transition:complete', {
      epochId,
      residualBonus: null,
      canvasConfig,
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** @returns {object|null} current epoch configuration */
  getCurrentEpoch() {
    return this.#currentConfig;
  }

  /**
   * Check whether the player has met the final milestone required to
   * transition to the next epoch.
   * @returns {boolean}
   */
  canTransition() {
    if (!this.#currentConfig) return false;
    const milestoneId = this.#currentConfig.transitionCondition?.milestoneId;
    if (!milestoneId) return false;
    const states = this.#milestoneSystem.getStates();
    return states[milestoneId]?.triggered === true;
  }

  /**
   * @returns {string} narrative text shown during the epoch transition overlay
   */
  getTransitionNarrative() {
    if (!this.#currentConfig) return '';
    return `The ${this.#currentConfig.displayName} epoch draws to a close…`;
  }

  // ── Transition ────────────────────────────────────────────────────────

  /**
   * Execute a full epoch transition:
   * 1. Emit transition:start
   * 2. Compute and store residual bonus
   * 3. Increment aeon count
   * 4. Reset all subsystems
   * 5. Load the next epoch (currently reloads epoch1 as a stub)
   * 6. Emit transition:complete
   *
   * @returns {Promise<boolean>} true if transition succeeded
   */
  async transition() {
    if (!this.canTransition()) return false;

    this.#eventBus.emit('epoch:transition:start', {
      fromEpoch: this.#gameState.epochId,
    });

    // Calculate residual bonus using the epoch's formula
    const bonus = this.#currentConfig.residualBonusFormula
      ? this.#currentConfig.residualBonusFormula({
          milestones: Object.values(this.#milestoneSystem.getStates()),
          upgrades: Object.values(this.#upgradeSystem.getStates()),
          aeonCount: this.#gameState.aeonCount,
        })
      : null;

    if (bonus) {
      this.#gameState.residualBonuses.push(bonus);
    }

    this.#gameState.aeonCount++;

    // Reset all subsystems
    this.#resourceManager.reset();
    this.#upgradeSystem.reset();
    this.#milestoneSystem.reset();
    this.#starManager.reset();

    // Load next epoch (stub: reload epoch1 with "coming soon" note)
    await this.loadEpoch('epoch1');

    return true;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /** Clear current epoch config (used by SaveSystem.reset()). */
  reset() {
    this.#currentConfig = null;
  }
}
