/**
 * AutoBuySystem — Developer tool that automatically purchases any affordable upgrade.
 *
 * Interval ranges from 2000ms (slow) down to 0ms (instant).
 * When instant (0ms), purchases are triggered reactively on affordability changes.
 */
export class AutoBuySystem {
  #eventBus;
  #upgradeSystem;
  #enabled = false;
  #intervalMs = 1000;
  #timerId = null;
  #isBuying = false;
  #onAffordabilityChanged;

  constructor(eventBus, upgradeSystem) {
    this.#eventBus = eventBus;
    this.#upgradeSystem = upgradeSystem;
    this.#onAffordabilityChanged = () => this.#tryBuyAll();
  }

  get enabled() { return this.#enabled; }
  get intervalMs() { return this.#intervalMs; }

  setEnabled(enabled) {
    this.#enabled = !!enabled;
    this.#restartTimer();
  }

  setIntervalMs(ms) {
    this.#intervalMs = Math.max(0, Math.min(2000, ms));
    if (this.#enabled) this.#restartTimer();
  }

  #restartTimer() {
    this.#stopTimer();
    if (!this.#enabled) return;

    if (this.#intervalMs === 0) {
      // Instant: react to every affordability change
      this.#eventBus.on('upgrade:affordability:changed', this.#onAffordabilityChanged);
      this.#tryBuyAll();
    } else {
      this.#timerId = setInterval(() => this.#tryBuyAll(), this.#intervalMs);
    }
  }

  #stopTimer() {
    if (this.#timerId !== null) {
      clearInterval(this.#timerId);
      this.#timerId = null;
    }
    this.#eventBus.off('upgrade:affordability:changed', this.#onAffordabilityChanged);
  }

  #tryBuyAll() {
    if (!this.#enabled || this.#isBuying) return;
    this.#isBuying = true;
    try {
      for (const { definition: def, state } of this.#upgradeSystem.getAll()) {
        if (!state.purchased && this.#upgradeSystem.canPurchase(def.id)) {
          this.#upgradeSystem.purchase(def.id);
        }
      }
    } finally {
      this.#isBuying = false;
    }
  }

  destroy() {
    this.#stopTimer();
  }
}
