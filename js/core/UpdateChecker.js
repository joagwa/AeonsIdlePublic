/**
 * UpdateChecker — Periodically fetches version.json to detect game updates.
 *
 * Emits 'update:available' via the event bus when a newer version is found.
 * Stops checking once an update is detected (user should refresh).
 */

const DEFAULT_CHECK_INTERVAL_MS = 300_000; // 5 minutes
const INITIAL_DELAY_MS = 30_000;           // 30 seconds after start

export class UpdateChecker {
  #currentVersion;
  #checkInterval;
  #timer = null;
  #eventBus;

  /**
   * @param {object} eventBus — EventBus instance
   * @param {string} currentVersion — The version this build was deployed with
   * @param {number} [checkIntervalMs] — How often to poll (default 5 min)
   */
  constructor(eventBus, currentVersion, checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS) {
    this.#eventBus = eventBus;
    this.#currentVersion = currentVersion;
    this.#checkInterval = checkIntervalMs;
  }

  /** Begin periodic version checks (first check after 30s). */
  start() {
    if (this.#currentVersion === 'dev') {
      console.log('[UpdateChecker] Dev mode — skipping version checks');
      return;
    }
    setTimeout(() => {
      this.#check();
      this.#timer = setInterval(() => this.#check(), this.#checkInterval);
    }, INITIAL_DELAY_MS);
  }

  /** Stop all future checks. */
  stop() {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #check() {
    try {
      // Bypass all caches with no-store + unique timestamp
      const resp = await fetch(`version.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!resp.ok) return;

      const data = await resp.json();
      if (data.version && data.version !== this.#currentVersion) {
        console.log(`[UpdateChecker] New version available: ${data.version} (current: ${this.#currentVersion})`);
        this.#eventBus.emit('update:available', {
          currentVersion: this.#currentVersion,
          newVersion: data.version,
          buildTime: data.buildTime,
        });
        this.stop();
      }
    } catch {
      // Network errors are silently ignored — shouldn't disrupt gameplay
    }
  }
}
