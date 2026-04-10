/**
 * DarkMatterSystem — Manages dark matter nodes that spawn in the void,
 * emit gravity-disrupting waves, and are collected by the player.
 *
 * Each collected node compounds the value of the next:
 *   value_n = compoundFactor ^ totalCollected
 */

// Wave constants — constant-height looping pulse
const WAVE_CONSTANT_ALPHA  = 0.22;  // fixed amplitude (subtle but detectable)
const WAVE_LOOP_RADIUS     = 900;   // px — wave resets and loops at this radius
const WAVE_SPEED           = 280;   // px/s — expansion rate
const WAVE_FADE_IN_RADIUS  = 250;   // px — alpha fades in over this distance to suppress near-field pre-wave

export class DarkMatterSystem {
  /**
   * @param {import('../core/EventBus.js?v=d436d67').EventBus} eventBus
   * @param {import('./UpgradeSystem.js?v=d436d67').UpgradeSystem} upgradeSystem
   */
  constructor(eventBus, upgradeSystem) {
    this.bus = eventBus;
    this.upgradeSystem = upgradeSystem;

    this.active = false;
    /** @type {Array<{x:number, y:number, pulsing:boolean, waveRadius:number, waveAlpha:number, waveStrength:number, nodeRadius:number, flickerTimer:number, displayOpacity:number, collected:boolean}>} */
    this.nodes = [];
    this.totalCollected = 0;

    /** @type {{x:number, y:number, w:number, h:number}|null} */
    this._voidBounds = null;
    this._spawnTimer = 3.0;
  }

  /** Set the void region bounds used for node placement. */
  setVoidBounds(bounds) {
    this._voidBounds = bounds;
  }

  /** Activate the system (called at ms_gasCloud milestone). */
  activate() {
    this.active = true;
    if (this.nodes.length === 0) this._spawnTimer = 2.0;
  }

  // ── Parameter derivation from upgrades ───────────────────────────────

  _getParams() {
    const spawnLevel    = this.upgradeSystem.getLevel('upg_darkMatterCurrents') || 0;
    const compoundLevel = this.upgradeSystem.getLevel('upg_darkMatterAccelerant') || 0;
    const radiusLevel   = this.upgradeSystem.getLevel('upg_darkMatterSiphon') || 0;
    const waveLevel     = this.upgradeSystem.getLevel('upg_gravityAmplifier2') || 0;
    const lensLevel     = this.upgradeSystem.getLevel('upg_gravitationalLensing') || 0;

    return {
      // Seconds between node spawns (decreases with upgrades, min 3s)
      spawnInterval: Math.max(3, 20 - spawnLevel * 2),
      // Max simultaneous nodes — always 1 to keep the void focused
      // (upg_darkFlow upgrade no longer applies; one node at a time is the intended design)
      maxNodes: 1,
      // Pixel radius within which the player absorbs a node
      collectRadius: 60 + radiusLevel * 40,
      // Exponential compound factor per collected node — base 2 means each node roughly doubles the value
      compoundFactor: 2.0 * Math.pow(1.15, compoundLevel) * Math.pow(1.20, lensLevel),
      // Outward force strength of the gravity wave
      waveStrength: 180 + waveLevel * 80,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────

  _spawnNode(params) {
    if (!this._voidBounds) return;
    const b = this._voidBounds;
    const margin = 350;
    if (b.w <= margin * 2 || b.h <= margin * 2) return;

    const x = b.x + margin + Math.random() * (b.w - margin * 2);
    const y = b.y + margin + Math.random() * (b.h - margin * 2);

    this.nodes.push({
      x,
      y,
      waveStrength: params.waveStrength,
      pulsing: true,
      waveRadius: 0,
      waveAlpha: WAVE_CONSTANT_ALPHA,
      nodeRadius: 5 + Math.random() * 4,
      // Offset flicker phase so nodes don't all pulse in sync
      flickerTimer: Math.random() * Math.PI * 2,
      displayOpacity: 0,
      collected: false,
    });
  }

  // ── Public update — called from main.js each game tick ────────────────

  /**
   * Update all nodes; return array of collected node events.
   * @param {number} dt  Delta time in seconds
   * @param {number} playerX  World X of the player (home object)
   * @param {number} playerY  World Y of the player
   * @returns {Array<{x:number, y:number, value:number}>}
   */
  update(dt, playerX, playerY) {
    if (!this.active) return [];

    const params = this._getParams();
    const collected = [];

    for (const node of this.nodes) {
      // Pre-compute player offset for the squared-distance collection check
      const dx = playerX - node.x;
      const dy = playerY - node.y;

      // Gentle flicker: slow sinusoidal opacity variation
      node.flickerTimer += dt * 0.7;
      node.displayOpacity = 0.10 + Math.sin(node.flickerTimer) * 0.04;

      // Constant looping wave — always expanding, resets when it reaches the loop radius
      node.waveRadius += dt * WAVE_SPEED;
      if (node.waveRadius >= WAVE_LOOP_RADIUS) {
        node.waveRadius = 0;
        // Notify the rest of the system — ParticleSystem applies radial force
        this.bus.emit('darkMatter:wave', {
          x: node.x,
          y: node.y,
          strength: node.waveStrength,
          radius: 420,
        });
      }
      // Fade in wave alpha over the first WAVE_FADE_IN_RADIUS px to eliminate
      // the near-field high-intensity pre-wave visible right after a loop reset
      node.waveAlpha = node.waveRadius < WAVE_FADE_IN_RADIUS
        ? WAVE_CONSTANT_ALPHA * (node.waveRadius / WAVE_FADE_IN_RADIUS)
        : WAVE_CONSTANT_ALPHA;

      // Collection: player proximity check (reuse pre-computed dx/dy)
      if (dx * dx + dy * dy < params.collectRadius * params.collectRadius) {
        const value = Math.pow(params.compoundFactor, this.totalCollected);
        this.totalCollected++;
        collected.push({ x: node.x, y: node.y, value });
        node.collected = true;
      }
    }

    // Remove collected nodes
    this.nodes = this.nodes.filter(n => !n.collected);

    // Spawn new nodes up to maxNodes
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0 && this.nodes.length < params.maxNodes) {
      this._spawnNode(params);
      this._spawnTimer = params.spawnInterval;
    }

    return collected;
  }

  /** Returns the live node array for rendering. */
  getNodes() {
    return this.nodes;
  }

  // ── Save / load ───────────────────────────────────────────────────────

  getState() {
    return { totalCollected: this.totalCollected };
  }

  loadState(state) {
    if (state) {
      this.totalCollected = state.totalCollected || 0;
    }
  }
}
