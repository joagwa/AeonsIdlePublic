/**
 * DarkMatterSystem — Manages dark matter nodes that spawn in the void,
 * emit gravity-disrupting waves, and are collected by the player.
 *
 * Each collected node compounds the value of the next:
 *   value_n = compoundFactor ^ totalCollected
 */

export class DarkMatterSystem {
  /**
   * @param {import('../core/EventBus.js?v=2e4f878').EventBus} eventBus
   * @param {import('./UpgradeSystem.js?v=2e4f878').UpgradeSystem} upgradeSystem
   */
  constructor(eventBus, upgradeSystem) {
    this.bus = eventBus;
    this.upgradeSystem = upgradeSystem;

    this.active = false;
    /** @type {Array<{x:number, y:number, pulseTimer:number, pulseInterval:number, pulsing:boolean, waveRadius:number, waveMaxRadius:number, waveAlpha:number, nodeRadius:number, flickerTimer:number, displayOpacity:number, collected:boolean, _reflTriggered:boolean, reflWave:{x:number,y:number,radius:number,alpha:number}|null}>} */
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
    const maxNodesLevel = this.upgradeSystem.getLevel('upg_darkFlow') || 0;
    const radiusLevel   = this.upgradeSystem.getLevel('upg_darkMatterSiphon') || 0;
    const waveLevel     = this.upgradeSystem.getLevel('upg_gravityAmplifier2') || 0;
    const lensLevel     = this.upgradeSystem.getLevel('upg_gravitationalLensing') || 0;

    return {
      // Seconds between node spawns (decreases with upgrades, min 3s)
      spawnInterval: Math.max(3, 20 - spawnLevel * 2),
      // Max simultaneous nodes in the void
      maxNodes: 1 + maxNodesLevel,
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
      // Time until first pulse (quarter of original for 4× overall frequency)
      pulseTimer: 1 + Math.random() * 1.25,
      // Time between recurring pulses (quarter of original for 4× overall frequency)
      pulseInterval: 1.25 + Math.random() * 1.5,
      waveStrength: params.waveStrength,
      pulsing: false,
      waveRadius: 0,
      waveMaxRadius: 0,
      waveAlpha: 0,
      nodeRadius: 5 + Math.random() * 4,
      // Offset flicker phase so nodes don't all pulse in sync
      flickerTimer: Math.random() * Math.PI * 2,
      displayOpacity: 0,
      collected: false,
      // Reflected ripple state — spawned when wave front crosses player position
      reflWave: null,
      _reflTriggered: false,
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
      // Gentle flicker: slow sinusoidal opacity variation
      node.flickerTimer += dt * 0.7;
      node.displayOpacity = 0.10 + Math.sin(node.flickerTimer) * 0.04;

      // Distance to player — computed once, used for pulse sizing, ripple trigger, and collection
      const dx = playerX - node.x;
      const dy = playerY - node.y;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);

      // Pulse countdown — wave max radius = player distance + 200 px so it just passes them
      node.pulseTimer -= dt;
      if (node.pulseTimer <= 0) {
        const waveMaxRadius = distToPlayer + 200;
        node.pulseTimer = node.pulseInterval;
        node.pulsing = true;
        node.waveRadius = 0;
        node.waveMaxRadius = waveMaxRadius;
        node.waveAlpha = 0.55;
        node._reflTriggered = false;
        node.reflWave = null;
        // Notify the rest of the system — ParticleSystem applies radial force
        this.bus.emit('darkMatter:wave', {
          x: node.x,
          y: node.y,
          strength: node.waveStrength,
          radius: waveMaxRadius,
        });
      }

      // Expand the visual wave ring
      if (node.pulsing) {
        node.waveRadius += dt * 360;
        node.waveAlpha = Math.max(0, 0.55 * (1 - node.waveRadius / node.waveMaxRadius));
        if (node.waveRadius >= node.waveMaxRadius) {
          node.pulsing = false;
          node.waveAlpha = 0;
        }
      }

      // Reflected ripple: trigger once when wave front crosses player position
      if (node.pulsing && !node._reflTriggered && node.waveRadius >= distToPlayer) {
        node._reflTriggered = true;
        node.reflWave = {
          x: playerX,
          y: playerY,
          radius: 0,
          alpha: 0.5,
        };
      }

      // Advance the reflected ripple
      if (node.reflWave) {
        node.reflWave.radius += dt * 200;
        node.reflWave.alpha = 0.5 * (1 - node.reflWave.radius / 140);
        if (node.reflWave.radius >= 140) {
          node.reflWave = null;
        }
      }

      // Collection: player proximity check
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
