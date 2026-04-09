/**
 * UpgradeSystem — Manages upgrade definitions, purchase logic, prerequisite
 * validation, and affordability tracking via EventBus events.
 *
 * Supports multi-level upgrades: upgrades with maxLevel > 1 can be purchased
 * multiple times. Effects scale with level. Prerequisites and milestone gates
 * are only checked on the first purchase (level 0 → 1).
 */

export class UpgradeSystem {
  /** @type {import('../core/EventBus.js?v=0ceebd9').EventBus} */
  #eventBus;
  /** @type {import('./ResourceManager.js?v=0ceebd9').ResourceManager} */
  #resourceManager;
  /** @type {import('./MilestoneSystem.js?v=0ceebd9').MilestoneSystem | null} */
  #milestoneSystem = null;
  /** @type {Map<string, object>} upgrade definitions keyed by id */
  #definitions = new Map();
  /** @type {Map<string, object>} upgrade states keyed by id — { purchased, level } */
  #states = new Map();
  /** @type {Map<string, boolean>} previous affordability per upgrade */
  #previousAffordability = new Map();

  constructor(EventBus, resourceManager) {
    this.#eventBus = EventBus;
    this.#resourceManager = resourceManager;
    this.#eventBus.on('resource:updated', () => this.#checkAffordabilityChanges());
  }

  // ── Dependency wiring ─────────────────────────────────────────────────

  setMilestoneSystem(ms) {
    this.#milestoneSystem = ms;
  }

  // ── Definitions ───────────────────────────────────────────────────────

  loadDefinitions(upgrades) {
    this.#definitions.clear();
    for (const def of upgrades) {
      this.#definitions.set(def.id, def);
      if (!this.#states.has(def.id)) {
        this.#states.set(def.id, { purchased: false, level: 0 });
      }
      this.#previousAffordability.set(def.id, false);
    }
  }

  // ── Cost ──────────────────────────────────────────────────────────────

  /**
   * Returns the cost for the NEXT purchase of this upgrade (scales with level).
   * Formula: baseCost * costScaling^currentLevel
   */
  getCost(upgradeId) {
    const def = this.#definitions.get(upgradeId);
    const state = this.#states.get(upgradeId);
    if (!def || !state) return Infinity;
    const scaling = def.costScaling || 1;
    return Math.round(def.baseCost * Math.pow(scaling, state.level));
  }

  // ── Purchase validation ───────────────────────────────────────────────

  /**
   * True only if the upgrade can actually be bought right now.
   * Prerequisites and milestone gate are only checked on first purchase (level 0).
   */
  canPurchase(upgradeId) {
    const def = this.#definitions.get(upgradeId);
    const state = this.#states.get(upgradeId);
    if (!def || !state) {
      console.debug(`[UpgradeSystem] canPurchase(${upgradeId}): no def/state`);
      return false;
    }

    const maxLevel = def.maxLevel || 1;
    if (state.level >= maxLevel) return false; // fully maxed

    if (!this.canAfford(upgradeId)) {
      console.debug(`[UpgradeSystem] canPurchase(${upgradeId}): can't afford — need ${this.getCost(upgradeId)} ${def.costResource}`);
      return false;
    }

    // Gate checks only apply to first purchase
    if (state.level === 0) {
      for (const prereqId of def.prerequisites) {
        const prereqState = this.#states.get(prereqId);
        // Requires at least 1 level purchased, not fully maxed
        if (!prereqState || prereqState.level < 1) {
          console.debug(`[UpgradeSystem] canPurchase(${upgradeId}): prereq ${prereqId} not met (level=${prereqState?.level})`);
          return false;
        }
      }
      if (def.requiresMilestone) {
        if (!this.#milestoneSystem) {
          console.debug(`[UpgradeSystem] canPurchase(${upgradeId}): no milestoneSystem`);
          return false;
        }
        const msState = this.#milestoneSystem.getStates()[def.requiresMilestone];
        if (!msState || !msState.triggered) {
          console.debug(`[UpgradeSystem] canPurchase(${upgradeId}): milestone ${def.requiresMilestone} not triggered`);
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns a human-readable reason why the upgrade is locked, or null if only
   * blocked by cost (or already maxed).
   * Gate checks only apply to first purchase (level 0).
   */
  getLockReason(upgradeId) {
    const def = this.#definitions.get(upgradeId);
    const state = this.#states.get(upgradeId);
    if (!def || !state || state.purchased) return null;

    if (state.level === 0) {
      for (const prereqId of def.prerequisites) {
        const prereqState = this.#states.get(prereqId);
        // Requires at least 1 level purchased, not fully maxed
        if (!prereqState || prereqState.level < 1) {
          const prereqDef = this.#definitions.get(prereqId);
          return `Requires: ${prereqDef ? prereqDef.name : prereqId}`;
        }
      }
      if (def.requiresMilestone) {
        if (!this.#milestoneSystem) return 'Milestone required';
        const msState = this.#milestoneSystem.getStates()[def.requiresMilestone];
        if (!msState || !msState.triggered) {
          const msDef = this.#milestoneSystem.getDefinition(def.requiresMilestone);
          const title = msDef ? msDef.title : def.requiresMilestone;
          return `Reach milestone: "${title}"`;
        }
      }
    }
    return null;
  }

  /**
   * True if this upgrade should be shown to the player:
   * - Already has at least 1 level purchased, OR
   * - Its cost-resource is visible to the player.
   */
  isVisible(upgradeId) {
    const def = this.#definitions.get(upgradeId);
    const state = this.#states.get(upgradeId);
    if (!def || !state) return false;
    if (state.level > 0) return true;
    const costRes = this.#resourceManager.get(def.costResource);
    return costRes ? costRes.visible : false;
  }

  canAfford(upgradeId) {
    const def = this.#definitions.get(upgradeId);
    if (!def) return false;
    const resource = this.#resourceManager.get(def.costResource);
    if (!resource) return false;
    return resource.currentValue >= this.getCost(upgradeId);
  }

  // ── Purchase ──────────────────────────────────────────────────────────

  /**
   * Attempt to purchase one level of an upgrade.
   * Returns true if the purchase succeeded.
   */
  purchase(upgradeId) {
    if (!this.canPurchase(upgradeId)) {
      console.debug(`[UpgradeSystem] purchase(${upgradeId}): canPurchase=false`);
      return false;
    }

    const def = this.#definitions.get(upgradeId);
    const state = this.#states.get(upgradeId);
    const cost = this.getCost(upgradeId);

    if (!this.#resourceManager.spend(def.costResource, cost)) {
      console.debug(`[UpgradeSystem] purchase(${upgradeId}): spend failed (cost=${cost} ${def.costResource})`);
      return false;
    }

    state.level += 1;
    const maxLevel = def.maxLevel || 1;
    if (state.level >= maxLevel) state.purchased = true;

    console.debug(`[UpgradeSystem] purchase(${upgradeId}): success → level ${state.level}/${maxLevel} (cost=${cost})`);

    this.#resourceManager.recalculateRates();

    this.#eventBus.emit('upgrade:purchased', {
      upgradeId,
      level: state.level,
      maxLevel,
      cost,
      costResource: def.costResource,
    });

    return true;
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Returns an array of { effectType, effectTarget, effectMagnitude } for
   * every upgrade that has been purchased at least once, scaling magnitude by level.
   *
   * Scaling rules:
   *   rateAdditive / capIncrease: effectMagnitude * level (linear stacking)
   *   rateMultiplier / clickMultiplier: effectMagnitude ^ level (exponential stacking)
   *   others: base magnitude (no scaling)
   */
  getPurchasedEffects() {
    const effects = [];
    for (const [id, state] of this.#states) {
      if (state.level === 0) continue;
      const def = this.#definitions.get(id);
      if (!def) continue;

      const level = state.level;
      let scaledMag = def.effectMagnitude;
      if (level > 1) {
        switch (def.effectType) {
          case 'rateAdditive':
          case 'capIncrease':
            scaledMag = def.effectMagnitude * level;
            break;
          case 'rateMultiplier':
          case 'clickMultiplier':
            scaledMag = Math.pow(def.effectMagnitude, level);
            break;
        }
      }

      effects.push({
        effectType: def.effectType,
        effectTarget: def.effectTarget,
        effectMagnitude: scaledMag,
      });
    }
    return effects;
  }

  /**
   * Returns all upgrades as { definition, state } sorted by tier.
   */
  getAll() {
    const result = [];
    for (const [id, def] of this.#definitions) {
      result.push({ definition: def, state: this.#states.get(id) });
    }
    result.sort((a, b) => (a.definition.tier || 0) - (b.definition.tier || 0));
    return result;
  }

  /**
   * Get the current level of an upgrade (0 if not purchased or doesn't exist).
   */
  getLevel(upgradeId) {
    return this.#states.get(upgradeId)?.level || 0;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  getStates() {
    const obj = {};
    for (const [id, state] of this.#states) {
      obj[id] = { ...state };
    }
    return obj;
  }

  loadStates(states) {
    if (!states) return;
    console.log('[UpgradeSystem] Loading upgrade states:', Object.keys(states));
    for (const [id, savedState] of Object.entries(states)) {
      const existing = this.#states.get(id);
      const def = this.#definitions.get(id);
      const maxLevel = def?.maxLevel || 1;

      // Old format had only `purchased: bool` with no level field.
      const level = savedState.level !== undefined ? savedState.level : (savedState.purchased ? 1 : 0);

      // Re-derive purchased from level >= maxLevel so multi-level upgrades
      // loaded from an old save aren't incorrectly treated as fully maxed.
      const purchased = level >= maxLevel;

      const normalized = { purchased, level };
      if (existing) {
        Object.assign(existing, normalized);
      } else {
        this.#states.set(id, normalized);
      }
      
      // Emit purchase event for ALL partially or fully purchased upgrades so
      // listeners can restore their state (e.g. gravity radius, mote generation rate).
      if (level > 0) {
        console.log(`[UpgradeSystem] Restored upgrade: ${id} (level ${level})`);
        this.#eventBus.emit('upgrade:purchased', { upgradeId: id, level });
      }
    }
  }

  reset() {
    this.#states.clear();
    this.#definitions.clear();
    this.#previousAffordability.clear();
  }

  // ── Affordability tracking ────────────────────────────────────────────

  #checkAffordabilityChanges() {
    for (const [id, state] of this.#states) {
      if (state.purchased) continue; // fully maxed
      const affordable = this.canAfford(id);
      const prev = this.#previousAffordability.get(id);
      if (affordable !== prev) {
        this.#previousAffordability.set(id, affordable);
        this.#eventBus.emit('upgrade:affordability:changed', {
          upgradeId: id,
          canAfford: affordable,
        });
      }
    }
  }
}
