/**
 * GameLoop — requestAnimationFrame driver with configurable-Hz tick accumulator.
 *
 * onTick callbacks fire at the configured tick rate (default 20 Hz / 50 ms)
 * with wall-clock dt in seconds.
 * onFrame callbacks fire at full rAF rate with the raw DOMHighResTimeStamp.
 */

const tickCallbacks = [];
const frameCallbacks = [];

let running = false;
let rafId = null;
let lastTimestamp = null;
let accumulator = 0;
let tickInterval = 1 / 20; // 50 ms default

function frame(timestamp) {
  if (!running) return;

  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
    rafId = requestAnimationFrame(frame);
    return;
  }

  const wallDelta = (timestamp - lastTimestamp) / 1000; // seconds
  lastTimestamp = timestamp;

  // Clamp unreasonably large deltas (e.g. returning from a background tab)
  const dt = Math.min(wallDelta, 1);

  // --- Fixed-rate tick accumulator ---
  accumulator += dt;
  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    for (let i = 0; i < tickCallbacks.length; i++) {
      tickCallbacks[i](tickInterval);
    }
  }

  // --- Full-rate frame callbacks ---
  for (let i = 0; i < frameCallbacks.length; i++) {
    frameCallbacks[i](timestamp);
  }

  rafId = requestAnimationFrame(frame);
}

export const GameLoop = Object.freeze({
  /**
   * Start the loop. Safe to call multiple times.
   */
  start() {
    if (running) return;
    running = true;
    lastTimestamp = null;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  },

  /**
   * Stop the loop.
   */
  stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTimestamp = null;
    accumulator = 0;
  },

  /**
   * Change the tick rate. Resets the accumulator to avoid burst ticks.
   * @param {number} hz — ticks per second (e.g. 20)
   */
  setTickRate(hz) {
    if (hz <= 0) return;
    tickInterval = 1 / hz;
    accumulator = 0;
  },

  /**
   * Register a fixed-rate tick callback.
   * @param {Function} cb — receives dt in seconds
   */
  onTick(cb) {
    tickCallbacks.push(cb);
  },

  /**
   * Register a full-rate frame callback.
   * @param {Function} cb — receives DOMHighResTimeStamp
   */
  onFrame(cb) {
    frameCallbacks.push(cb);
  },
});
