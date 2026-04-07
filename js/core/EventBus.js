/**
 * EventBus — Pub/sub singleton for game-wide event dispatch.
 * Synchronous emission; listeners fire in registration order.
 */

const listeners = new Map();

export const EventBus = Object.freeze({
  /**
   * Register a callback for the given event.
   * @param {string} event
   * @param {Function} cb
   */
  on(event, cb) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(cb);
  },

  /**
   * Remove a previously registered callback.
   * @param {string} event
   * @param {Function} cb
   */
  off(event, cb) {
    const set = listeners.get(event);
    if (set) {
      set.delete(cb);
      if (set.size === 0) listeners.delete(event);
    }
  },

  /**
   * Synchronously invoke all listeners for the given event.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(data);
    }
  },
});
