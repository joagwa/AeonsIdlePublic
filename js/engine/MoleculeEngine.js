/**
 * MoleculeEngine — Passive molecule synthesis from element resources.
 *
 * Each tick, visible molecules whose ingredients are available are
 * synthesised at a base rate (configurable per molecule).
 */

export class MoleculeEngine {
  /** @type {import('./ResourceManager.js?v=45c16a8').ResourceManager} */
  #resourceManager;
  /** @type {Set<string>} molecule IDs produced at least once */
  #firstProduced = new Set();
  /** @type {import('../core/EventBus.js?v=45c16a8').EventBus} */
  #eventBus;

  static RECIPES = {
    mol_h2o:   { ingredients: { hydrogen: 2, oxygen: 1 },   ratePerSec: 0.01  },
    mol_co2:   { ingredients: { carbon: 1, oxygen: 2 },     ratePerSec: 0.01  },
    mol_ch4:   { ingredients: { carbon: 1, hydrogen: 4 },   ratePerSec: 0.01  },
    mol_fe2o3: { ingredients: { iron: 2, oxygen: 3 },       ratePerSec: 0.005 },
  };

  constructor(EventBus, resourceManager) {
    this.#eventBus = EventBus;
    this.#resourceManager = resourceManager;
  }

  // ── Tick ─────────────────────────────────────────────────────────────

  /**
   * Attempt to synthesise all unlocked molecules.
   * @param {number} dt
   */
  tick(dt) {
    for (const [molId, recipe] of Object.entries(MoleculeEngine.RECIPES)) {
      const molState = this.#resourceManager.get(molId);
      if (!molState || !molState.visible) continue;

      const targetOutput = recipe.ratePerSec * dt;

      // Determine limiting fraction from ingredient availability
      let fraction = 1;
      for (const [elemId, ratio] of Object.entries(recipe.ingredients)) {
        const needed = targetOutput * ratio;
        if (needed <= 0) continue;
        const elemState = this.#resourceManager.get(elemId);
        if (!elemState || elemState.currentValue < needed * 0.001) {
          fraction = 0;
          break;
        }
        fraction = Math.min(fraction, elemState.currentValue / needed);
      }
      if (fraction <= 0) continue;
      fraction = Math.min(1, fraction);

      // Consume ingredients
      for (const [elemId, ratio] of Object.entries(recipe.ingredients)) {
        this.#resourceManager.spend(elemId, targetOutput * ratio * fraction);
      }

      // Produce molecule
      const produced = targetOutput * fraction;
      this.#resourceManager.add(molId, produced);

      if (!this.#firstProduced.has(molId)) {
        this.#firstProduced.add(molId);
        this.#eventBus.emit('molecule:first', { molId });
      }
    }
  }
}
