/**
 * ProceduralMoteGenerator — Generates motes procedurally based on world position.
 * Uses seeded PRNG for deterministic generation (same position = same motes).
 * Supports mote quality tiers (Base, Common, Rare, Epic, Legendary).
 */

export class ProceduralMoteGenerator {
  constructor(EventBus) {
    this.bus = EventBus;
    this.generationRate = 5;          // motes per second (base)
    this.qualityLevel = 0;             // quality upgrade level (0-5)
    this.loadedChunks = new Set();     // track which chunks have been generated
    this.chunkSize = 1000;             // pixels per chunk
    this.motesByChunk = new Map();     // chunk key -> array of motes
    this.nextChunkCheckTime = 0;       // throttle chunk loading
  }

  /**
   * Seeded PRNG for deterministic generation.
   * Same seed always produces same sequence.
   */
  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Hash world position to chunk coordinates.
   * e.g., (0-999, 0-999) → chunk (0, 0)
   * e.g., (1000-1999, 0-999) → chunk (1, 0)
   */
  getChunkCoords(worldX, worldY) {
    return {
      cx: Math.floor(worldX / this.chunkSize),
      cy: Math.floor(worldY / this.chunkSize),
    };
  }

  /**
   * Unique key for chunk identification.
   */
  getChunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  /**
   * Generate motes for a chunk deterministically.
   * Quality distribution based on qualityLevel.
   */
  generateChunkMotes(cx, cy) {
    const key = this.getChunkKey(cx, cy);
    if (this.loadedChunks.has(key)) {
      return this.motesByChunk.get(key) || [];
    }

    const motes = [];
    const seed = cx * 73856093 ^ cy * 19349663;  // spatial hash seed
    const moteCountTarget = 15 + Math.floor(this.generationRate);  // ~15-90 motes per chunk

    for (let i = 0; i < moteCountTarget; i++) {
      const rand1 = this.seededRandom(seed + i * 0.1);
      const rand2 = this.seededRandom(seed + i * 0.2);
      const rand3 = this.seededRandom(seed + i * 0.3);

      const x = cx * this.chunkSize + rand1 * this.chunkSize;
      const y = cy * this.chunkSize + rand2 * this.chunkSize;

      // Quality tier determination based on qualityLevel
      const quality = this._selectQuality(rand3);

      motes.push({
        x,
        y,
        quality,
        vx: (this.seededRandom(seed + i * 0.4) - 0.5) * 20,
        vy: (this.seededRandom(seed + i * 0.5) - 0.5) * 20,
        size: 2,
        brightness: 0.6,
        type: 'mote',
        absorbed: false,
      });
    }

    this.loadedChunks.add(key);
    this.motesByChunk.set(key, motes);
    return motes;
  }

  /**
   * Select quality tier based on random value and qualityLevel.
   * qualityLevel 0-5 increases chance of better tiers.
   * Returns: 0=base, 1=common, 2=rare, 3=epic, 4=legendary
   */
  _selectQuality(rand) {
    // Base quality distribution:
    // Lv0: 100% base
    // Lv1: 80% base, 20% common
    // Lv2: 60% base, 25% common, 15% rare
    // Lv3: 50% base, 25% common, 15% rare, 10% epic
    // Lv4: 40% base, 25% common, 15% rare, 10% epic, 10% legendary
    // Lv5: 30% base, 25% common, 20% rare, 15% epic, 10% legendary

    const thresholds = [
      [1.0, 0, 0, 0, 0],           // Lv0: all base
      [0.8, 0.2, 0, 0, 0],         // Lv1
      [0.6, 0.25, 0.15, 0, 0],     // Lv2
      [0.5, 0.25, 0.15, 0.1, 0],   // Lv3
      [0.4, 0.25, 0.15, 0.1, 0.1], // Lv4
      [0.3, 0.25, 0.2, 0.15, 0.1], // Lv5
    ][Math.min(this.qualityLevel, 5)];

    let cumulative = 0;
    for (let i = 0; i < thresholds.length; i++) {
      cumulative += thresholds[i];
      if (rand < cumulative) return i;
    }
    return 0;  // fallback to base
  }

  /**
   * Get visible motes from chunks around camera viewport.
   * Returns array of mote objects ready for rendering/physics.
   */
  getVisibleMotes(camX, camY, viewW, viewH) {
    // Calculate which chunks are visible
    const minChunkX = Math.floor(camX / this.chunkSize) - 1;
    const maxChunkX = Math.floor((camX + viewW) / this.chunkSize) + 1;
    const minChunkY = Math.floor(camY / this.chunkSize) - 1;
    const maxChunkY = Math.floor((camY + viewH) / this.chunkSize) + 1;

    const visibleMotes = [];

    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cy = minChunkY; cy <= maxChunkY; cy++) {
        const motes = this.generateChunkMotes(cx, cy);
        visibleMotes.push(...motes);
      }
    }

    return visibleMotes;
  }

  /**
   * Update generation rate based on upgrades.
   */
  setGenerationRate(rate) {
    this.generationRate = rate;
  }

  /**
   * Update quality level based on upgrades.
   */
  setQualityLevel(level) {
    this.qualityLevel = Math.min(level, 5);
  }

  /**
   * Get mote value multiplier based on quality tier.
   * Base = 1.0x, Common = 1.5x, Rare = 2.5x, Epic = 5x, Legendary = 10x
   */
  static getQualityMultiplier(quality) {
    const multipliers = [1.0, 1.5, 2.5, 5, 10];
    return multipliers[Math.min(quality, 4)] || 1.0;
  }

  /**
   * Get color for mote based on quality tier.
   */
  static getQualityColor(quality) {
    const colors = [
      '#5878c0',  // Base: blue
      '#00d4ff',  // Common: cyan
      '#c850ff',  // Rare: purple
      '#ffd700',  // Epic: gold
      '#ffffff',  // Legendary: white
    ];
    return colors[Math.min(quality, 4)] || '#5878c0';
  }

  /**
   * Clear all loaded chunks (e.g., on reset).
   */
  clearChunks() {
    this.loadedChunks.clear();
    this.motesByChunk.clear();
  }
}
