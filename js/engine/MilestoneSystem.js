/**
 * MilestoneSystem — Evaluates milestone conditions each tick, triggers
 * narrative events, and maintains the chronicle log.
 */

export class MilestoneSystem {
  /** @type {import('../core/EventBus.js').EventBus} */
  #eventBus;
  /** @type {import('./ResourceManager.js').ResourceManager} */
  #resourceManager;
  /** @type {Map<string, object>} milestone definitions keyed by id */
  #definitions = new Map();
  /** @type {Map<string, object>} milestone states keyed by id */
  #states = new Map();
  /** @type {object[]} ordered chronicle entries */
  #chronicleLog = [];

  /**
   * @param {import('../core/EventBus.js').EventBus} EventBus
   * @param {import('./ResourceManager.js').ResourceManager} resourceManager
   */
  constructor(EventBus, resourceManager) {
    this.#eventBus = EventBus;
    this.#resourceManager = resourceManager;

    // Star lifecycle milestones are checked reactively via events
    this.#eventBus.on('star:stage:changed', (data) => this.#onStarStageChanged(data));
  }

  // ── Definitions ───────────────────────────────────────────────────────

  /**
   * Store milestone definitions and create default MilestoneState for each.
   * Preserves states already loaded from a save for matching ids.
   * @param {object[]} milestones
   */
  loadDefinitions(milestones) {
    this.#definitions.clear();
    for (const def of milestones) {
      this.#definitions.set(def.id, def);
      if (!this.#states.has(def.id)) {
        this.#states.set(def.id, { triggered: false, triggeredAt: null });
      }
    }
  }

  // ── Condition evaluation ──────────────────────────────────────────────

  /**
   * Iterate all untriggered milestones and evaluate their conditions.
   * Call once per game tick.
   */
  check() {
    for (const [id, state] of this.#states) {
      if (state.triggered) continue;

      const def = this.#definitions.get(id);
      if (!def) continue;

      let conditionMet = false;

      switch (def.conditionType) {
        case 'resource_threshold': {
          const resource = this.#resourceManager.get(def.conditionTarget);
          conditionMet = resource !== undefined && resource.currentValue >= def.conditionValue;
          break;
        }
        case 'game_state':
          conditionMet = def.conditionTarget === 'always_true';
          break;
        case 'upgrade_purchased':
          // Upgrade-based milestones would need an upgradeSystem reference;
          // currently unused in epoch1 data, kept as a stub.
          break;
        case 'star_cycle':
          // Handled reactively via star:stage:changed events
          continue;
        default:
          break;
      }

      if (conditionMet) {
        this.#trigger(id);
      }
    }
  }

  // ── Trigger ───────────────────────────────────────────────────────────

  /**
   * Mark a milestone as triggered, log it, and emit the event.
   * @param {string} id
   */
  #trigger(id) {
    const state = this.#states.get(id);
    const def = this.#definitions.get(id);
    if (!state || !def || state.triggered) return;

    state.triggered = true;
    state.triggeredAt = Date.now();

    this.#chronicleLog.push({
      milestoneId: id,
      title: def.title,
      triggeredAt: state.triggeredAt,
    });

    this.#eventBus.emit('milestone:triggered', {
      milestoneId: id,
      title: def.title,
      flavourText: def.flavourText,
      reward: def.reward,
      triggeredAt: state.triggeredAt,
    });
  }

  // ── Star lifecycle listener ───────────────────────────────────────────

  /** @param {object} data — star:stage:changed event payload */
  #onStarStageChanged(data) {
    for (const [id, state] of this.#states) {
      if (state.triggered) continue;
      const def = this.#definitions.get(id);
      if (!def || def.conditionType !== 'star_cycle') continue;

      if (def.conditionTarget === 'star_stage' && def.conditionValue === data.newStage) {
        this.#trigger(id);
      }

      if (def.conditionTarget === 'star_cycle_complete' && data.cyclesCompleted >= def.conditionValue) {
        this.#trigger(id);
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** @returns {object|undefined} milestone definition for the given id (includes title) */
  getDefinition(id) {
    return this.#definitions.get(id);
  }

  /** @returns {number} count of triggered milestones */
  getTriggeredCount() {
    let count = 0;
    for (const state of this.#states.values()) {
      if (state.triggered) count++;
    }
    return count;
  }

  /** @returns {object[]} ordered array of chronicle entries */
  getChronicleLog() {
    return [...this.#chronicleLog];
  }

  /**
   * Returns the first untriggered milestone that can show meaningful progress.
   * Skips `game_state` conditions (always_true, trigger immediately).
   * @returns {{ id, title, conditionType, conditionTarget, conditionValue } | null}
   */
  getNextGoal() {
    for (const [id, def] of this.#definitions) {
      const state = this.#states.get(id);
      if (state?.triggered) continue;
      if (def.conditionType === 'game_state') continue;
      return {
        id: def.id,
        title: def.title,
        conditionType: def.conditionType,
        conditionTarget: def.conditionTarget,
        conditionValue: def.conditionValue,
      };
    }
    return null;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  /** @returns {object} states keyed by milestone id */
  getStates() {
    const obj = {};
    for (const [id, state] of this.#states) {
      obj[id] = { ...state };
    }
    return obj;
  }

  /** Restore states from save data. */
  loadStates(states) {
    if (!states) return;
    for (const [id, savedState] of Object.entries(states)) {
      const existing = this.#states.get(id);
      if (existing) {
        Object.assign(existing, savedState);
      } else {
        this.#states.set(id, { ...savedState });
      }
    }
  }

  /** Restore chronicle log from save data. */
  loadChronicleLog(log) {
    this.#chronicleLog = Array.isArray(log) ? [...log] : [];
  }

  /** Clear all trigger states and the chronicle log. */
  reset() {
    this.#states.clear();
    this.#definitions.clear();
    this.#chronicleLog = [];
  }

  /** Debug helper: trigger a milestone regardless of its condition. */
  forceTrigger(id) {
    this.#trigger(id);
  }
}
