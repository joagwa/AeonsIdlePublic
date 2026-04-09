/**
 * StarManager — Manages the stellar lifecycle: stage progression,
 * heavy-element yields on cycle completion, and multi-star slots.
 */

const STAGE_DURATIONS = {
  main_sequence: 120,
  red_giant: 60,
  supernova: 10,
  neutron_star: 30,
};

const STAGE_ORDER = ['main_sequence', 'red_giant', 'supernova', 'neutron_star'];

const BASE_HEAVY_ELEMENTS_YIELD = 10;

export class StarManager {
  /** @type {import('../core/EventBus.js?v=d57f9ab').EventBus} */
  #eventBus;
  /** @type {import('./ResourceManager.js?v=d57f9ab').ResourceManager} */
  #resourceManager;
  /** @type {object[]} active star instances */
  #stars = [];
  /** @type {number} running counter for unique star ids */
  #starCount = 0;

  /**
   * @param {import('../core/EventBus.js?v=d57f9ab').EventBus} EventBus
   * @param {import('./ResourceManager.js?v=d57f9ab').ResourceManager} resourceManager
   */
  constructor(EventBus, resourceManager) {
    this.#eventBus = EventBus;
    this.#resourceManager = resourceManager;
  }

  // ── Star creation ─────────────────────────────────────────────────────

  /**
   * Create a new star in the main_sequence stage.
   * @returns {object} the new star state
   */
  addStar() {
    const star = {
      id: 'star_' + this.#starCount,
      stage: 'main_sequence',
      stageTimer: STAGE_DURATIONS.main_sequence,
      stageProgress: 0,
      cyclesCompleted: 0,
      durationMult: 1.0,
      yieldMult: 1.0,
    };

    this.#stars.push(star);
    this.#starCount++;

    this.#eventBus.emit('star:created', {
      starId: star.id,
      slot: this.#stars.length - 1,
    });

    return star;
  }

  // ── Tick ───────────────────────────────────────────────────────────────

  /**
   * Advance each star's stage timer. On expiry, transition to the next
   * stage. When completing a full cycle (neutron_star → main_sequence),
   * yield heavy elements.
   * @param {number} dt — seconds since last tick
   */
  tick(dt) {
    for (const star of this.#stars) {
      const adjustedDuration = STAGE_DURATIONS[star.stage] * star.durationMult;

      star.stageTimer -= dt;
      star.stageProgress = Math.max(0, Math.min(1, 1 - star.stageTimer / adjustedDuration));

      if (star.stageTimer <= 0) {
        const previousStage = star.stage;
        const currentIndex = STAGE_ORDER.indexOf(star.stage);
        const nextIndex = (currentIndex + 1) % STAGE_ORDER.length;
        star.stage = STAGE_ORDER[nextIndex];

        let heavyElementsYielded = 0;

        // Cycle complete: neutron_star → main_sequence
        if (previousStage === 'neutron_star' && star.stage === 'main_sequence') {
          star.cyclesCompleted++;
          heavyElementsYielded =
            BASE_HEAVY_ELEMENTS_YIELD * star.yieldMult * (1 + star.cyclesCompleted * 0.5);
          this.#resourceManager.add('heavyElements', heavyElementsYielded);
        }

        // Reset timer for new stage
        star.stageTimer = STAGE_DURATIONS[star.stage] * star.durationMult;
        star.stageProgress = 0;

        this.#eventBus.emit('star:stage:changed', {
          starId: star.id,
          newStage: star.stage,
          previousStage,
          cyclesCompleted: star.cyclesCompleted,
          heavyElementsYielded,
        });
      }
    }
  }

  // ── Modifiers ─────────────────────────────────────────────────────────

  /** Apply a duration multiplier to all stars (lower = faster). */
  setDurationMult(mult) {
    for (const star of this.#stars) {
      star.durationMult = mult;
    }
  }

  /** Recalculate yield multiplier from purchased upgrade effects. */
  setYieldMult(upgradeSystem) {
    let mult = 1.0;
    const effects = upgradeSystem.getPurchasedEffects();
    for (const effect of effects) {
      if (effect.effectTarget === 'heavyElements' && effect.effectType === 'rateMultiplier') {
        mult *= effect.effectMagnitude;
      }
    }
    for (const star of this.#stars) {
      star.yieldMult = mult;
    }
  }

  /** Debug helper: force a star's timer to expire this tick. */
  forceStageTransition(starId) {
    const star = this.#stars.find((s) => s.id === starId);
    if (star) star.stageTimer = 0;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  /** @returns {object[]} cloned array of star states */
  getStates() {
    return this.#stars.map((s) => ({ ...s }));
  }

  /** Restore stars from save data. */
  loadStates(states) {
    if (!Array.isArray(states)) return;
    this.#stars = states.map((s) => ({ ...s }));
    this.#starCount = this.#stars.length;
  }

  /** Clear all stars. */
  reset() {
    this.#stars = [];
    this.#starCount = 0;
  }
}
