/**
 * ParticleSystem — Per-region particle arrays with max 500 per region.
 * Handles spawning, movement, wrapping, brightness flickering, and drawing.
 * Supports "attracted" particles that home toward a target (e.g. the home object).
 */

const MAX_PER_REGION = 500;

export class ParticleSystem {
  constructor(spriteManager) {
    this.spriteManager = spriteManager;
    /** @type {Map<string, {particles: object[], config: object, params: object, targetDensity: number, attraction: object|null}>} */
    this.regions = new Map();
    this._glowCtx = null;
    /** @type {((worldX: number, worldY: number) => void)|null} */
    this._onAbsorb = null;
  }

  /** Initialize particle arrays for each region. */
  loadRegions(regions) {
    this.regions.clear();
    for (const region of regions) {
      this.regions.set(region.regionId, {
        particles: [],
        config: region,
        params: { density: 0, motionSpeed: 1, brightness: 1 },
        targetDensity: 0,
        // Apply stored attraction defaults so gravity persists across region reloads
        attraction: this._defaultAttraction ? { ...this._defaultAttraction } : null,
      });
    }
  }

  /** Spawn a single particle of the given type in the given region. */
  spawnParticle(regionId, type) {
    const entry = this.regions.get(regionId);
    if (!entry || entry.particles.length >= MAX_PER_REGION) return;

    const bounds = entry.config.worldBounds;
    const sprite = this.spriteManager.getSprite(type);
    if (!sprite) return;

    const size = sprite.minSize + Math.random() * (sprite.maxSize - sprite.minSize);

    entry.particles.push({
      x: bounds.x + Math.random() * bounds.w,
      y: bounds.y + Math.random() * bounds.h,
      vx: (Math.random() - 0.5) * 2 * 1.5 + 0.5 * Math.sign(Math.random() - 0.5),
      vy: (Math.random() - 0.5) * 2 * 1.5 + 0.5 * Math.sign(Math.random() - 0.5),
      size,
      brightness: 0.4 + Math.random() * 0.5,
      type,
      sprite,
      attracted: false,
    });
  }

  /**
   * Spawn a replacement particle at a random edge of the region
   * (used after an attracted particle is absorbed).
   */
  _spawnEdgeParticle(entry) {
    if (entry.particles.length >= MAX_PER_REGION) return;

    const bounds = entry.config.worldBounds;
    const types = entry.config.particleTypes;
    const type = types[Math.floor(Math.random() * types.length)];
    const sprite = this.spriteManager.getSprite(type);
    if (!sprite) return;

    const size = sprite.minSize + Math.random() * (sprite.maxSize - sprite.minSize);

    let x, y;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: x = bounds.x + Math.random() * bounds.w; y = bounds.y + 2; break;
      case 1: x = bounds.x + Math.random() * bounds.w; y = bounds.y + bounds.h - 2; break;
      case 2: x = bounds.x + 2;                         y = bounds.y + Math.random() * bounds.h; break;
      default: x = bounds.x + bounds.w - 2;             y = bounds.y + Math.random() * bounds.h; break;
    }

    entry.particles.push({ x, y, vx: 0, vy: 0, size, brightness: 0.4 + Math.random() * 0.4, type, sprite, attracted: false });
  }

  /** Update all particles: position, wrapping, flicker, attraction homing, absorption. */
  update(dt) {
    for (const [, entry] of this.regions) {
      const bounds = entry.config.worldBounds;
      const speed = entry.params.motionSpeed;
      const attraction = entry.attraction;
      const aParms = entry.attractionParams || { conversionRate: 1, speedMultiplier: 1 };

      // --- Move particles ---
      const gravRadius = attraction ? (attraction.gravityRadius || 600) : 0;

      for (const p of entry.particles) {
        if (p.attracted && attraction) {
          // Quadratic distance-based speed: slow at edge, fast near center
          const dx = attraction.targetX - p.x;
          const dy = attraction.targetY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            const t = Math.max(0, 1 - dist / gravRadius); // 0 at edge, 1 at center
            const minSpd = 3;
            const maxSpd = 150;
            const moveSpeed = (minSpd + (maxSpd - minSpd) * t * t) * aParms.speedMultiplier;
            p.x += (dx / dist) * moveSpeed * dt;
            p.y += (dy / dist) * moveSpeed * dt;
            // Brighten and grow as approaching
            p.brightness = Math.min(1, 0.35 + t * 0.65);
            p.size = p.sprite.minSize + (p.sprite.maxSize - p.sprite.minSize) * Math.min(1, t);
          }
        } else {
          // Normal ambient drift
          p.x += p.vx * speed * dt;
          p.y += p.vy * speed * dt;

          // Wrap within region bounds
          if (p.x < bounds.x)             p.x += bounds.w;
          else if (p.x > bounds.x + bounds.w) p.x -= bounds.w;
          if (p.y < bounds.y)             p.y += bounds.h;
          else if (p.y > bounds.y + bounds.h) p.y -= bounds.h;

          // Brightness flicker
          if (p.sprite.flickerRate > 0) {
            p.brightness += (Math.random() - 0.5) * p.sprite.flickerRate * dt * 4;
            p.brightness = Math.max(0.15, Math.min(0.9, p.brightness));
          }
        }
      }

      // --- Absorption: remove attracted particles that have reached the target ---
      if (attraction) {
        const absorbed = [];
        const aParms = entry.attractionParams || { conversionRate: 1, speedMultiplier: 1 };
        for (let i = 0; i < entry.particles.length; i++) {
          const p = entry.particles[i];
          if (p.attracted) {
            const dx = attraction.targetX - p.x;
            const dy = attraction.targetY - p.y;
            if (dx * dx + dy * dy < 36) absorbed.push(i); // within 6px
          }
        }
        for (let i = absorbed.length - 1; i >= 0; i--) {
          const particle = entry.particles[absorbed[i]];
          const quality = particle.quality || 0;
          entry.particles.splice(absorbed[i], 1);
          this._spawnEdgeParticle(entry); // replace at edge to maintain density
          if (this._onAbsorb) {
            this._onAbsorb(attraction.targetX, attraction.targetY, quality);
          }
        }

        // --- Proximity-based attraction: ALL particles within gravityRadius drift inward ---
        const gravRadiusSq = gravRadius * gravRadius;

        for (const p of entry.particles) {
          if (p.attracted) continue;

          const dx = attraction.targetX - p.x;
          const dy = attraction.targetY - p.y;
          if (dx * dx + dy * dy < gravRadiusSq) {
            p.attracted = true;
          }
        }
      }

      // Gradually spawn toward target density (1-2 per frame)
      if (entry.targetDensity > entry.particles.length) {
        const toSpawn = Math.min(2, entry.targetDensity - entry.particles.length);
        const types = entry.config.particleTypes;
        for (let i = 0; i < toSpawn; i++) {
          this.spawnParticle(entry.config.regionId, types[Math.floor(Math.random() * types.length)]);
        }
      }
    }
  }

  /** Draw visible particles on the main context. Glow particles on glow context. */
  draw(ctx, camera, viewW, viewH) {
    for (const [, entry] of this.regions) {
      const bri = entry.params.brightness;
      for (const p of entry.particles) {
        if (!camera.isVisible(p.x, p.y, p.size, p.size)) continue;

        const { sx, sy } = camera.worldToScreen(p.x, p.y);
        const alpha = p.brightness * bri;
        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha));
        ctx.fillStyle = p.attracted ? '#b8d4ff' : p.sprite.baseColor; // attracted particles are brighter blue-white
        ctx.fillRect(Math.round(sx), Math.round(sy), Math.ceil(p.size), Math.ceil(p.size));

        // Glow on separate context (attracted particles always glow when close to target)
        const shouldGlow = p.sprite.glowRadius > 0 || p.attracted;
        if (shouldGlow && this._glowCtx) {
          this._glowCtx.globalAlpha = Math.max(0.05, Math.min(0.7, alpha * 0.5));
          this._glowCtx.fillStyle = p.attracted ? '#c0dcff' : p.sprite.baseColor;
          const gr = p.attracted ? Math.ceil(p.size) : p.sprite.glowRadius;
          this._glowCtx.fillRect(
            Math.round(sx - gr),
            Math.round(sy - gr),
            Math.ceil(p.size + gr * 2),
            Math.ceil(p.size + gr * 2)
          );
        }
      }
    }
    ctx.globalAlpha = 1;
    if (this._glowCtx) this._glowCtx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // Attraction API
  // ---------------------------------------------------------------

  /**
   * Enable gravitational attraction for a region — particles within gravityRadius
   * of the target will be pulled toward it and absorbed.
   * @param {string} regionId
   * @param {number} targetX  World X of attraction centre
   * @param {number} targetY  World Y of attraction centre
   * @param {number} [gravityRadius=100]  Radius within which particles become attracted
   */
  enableAttraction(regionId, targetX, targetY, gravityRadius = 100) {
    const entry = this.regions.get(regionId);
    if (entry) entry.attraction = { targetX, targetY, gravityRadius };
  }

  /**
   * Enable attraction in ALL active regions at once (used when mote moves between regions).
   */
  enableAttractionAll(targetX, targetY, gravityRadius = 600) {
    let enabledCount = 0;
    for (const [regionId, entry] of this.regions) {
      entry.attraction = { targetX, targetY, gravityRadius };
      enabledCount++;
      if (window.AEONS_DEBUG && enabledCount <= 3) {
        console.log(`[ParticleSystem] Gravity enabled in ${regionId}: ${entry.particles.length} particles, target density ${entry.targetDensity}`);
      }
    }
    // Store attraction defaults so newly added regions also get attraction
    this._defaultAttraction = { targetX, targetY, gravityRadius };
    console.log(`[ParticleSystem] Gravity enabled in ${enabledCount} regions at (${targetX}, ${targetY}), radius ${gravityRadius}`);
  }

  /**
   * Update the attraction target position in ALL regions.
   * Used to track mote movement each frame.
   */
  updateAttractionTargetAll(x, y, gravityRadius) {
    for (const [, entry] of this.regions) {
      if (entry.attraction) {
        entry.attraction.targetX = x;
        entry.attraction.targetY = y;
        if (gravityRadius !== undefined) entry.attraction.gravityRadius = gravityRadius;
      }
    }
    // Keep default in sync so newly loaded regions get latest position
    if (this._defaultAttraction) {
      this._defaultAttraction.targetX = x;
      this._defaultAttraction.targetY = y;
      if (gravityRadius !== undefined) this._defaultAttraction.gravityRadius = gravityRadius;
    }
  }

  /**
   * Update the attraction target position without re-enabling.
   * Used to track mote movement each frame.
   */
  updateAttractionTarget(regionId, x, y) {
    const entry = this.regions.get(regionId);
    if (entry?.attraction) {
      entry.attraction.targetX = x;
      entry.attraction.targetY = y;
    }
  }

  /**
   * Set attraction tuning parameters for tractor beam effects.
   * @param {string} regionId
   * @param {{ conversionRate?: number, speedMultiplier?: number }} params
   */
  setAttractionParams(regionId, params) {
    const entry = this.regions.get(regionId);
    if (entry) {
      if (!entry.attractionParams) entry.attractionParams = { conversionRate: 1, speedMultiplier: 1 };
      Object.assign(entry.attractionParams, params);
    }
  }

  /** Disable attraction for a region. */
  disableAttraction(regionId) {
    const entry = this.regions.get(regionId);
    if (entry) {
      entry.attraction = null;
      for (const p of entry.particles) p.attracted = false;
    }
  }

  /**
   * Register a callback invoked each time an attracted particle is absorbed.
   * @param {(worldX: number, worldY: number) => void} fn
   */
  setAbsorptionCallback(fn) {
    this._onAbsorb = fn;
  }

  // ---------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------

  /** Adjust particle behavior for a region. */
  setRegionParams(regionId, params) {
    const entry = this.regions.get(regionId);
    if (entry) Object.assign(entry.params, params);
  }

  /** Total particle count across all regions. */
  getCount() {
    let total = 0;
    for (const [, entry] of this.regions) total += entry.particles.length;
    return total;
  }

  /** Spawn a batch of initial particles for a newly activated region. */
  spawnInitialParticles(regionId, count) {
    const entry = this.regions.get(regionId);
    if (!entry) return;
    entry.targetDensity = Math.min(count, MAX_PER_REGION);
    entry.params.density = entry.targetDensity;
    entry.params.brightness = 1;
  }

  /** Store the glow canvas 2D context for glow particle rendering. */
  setGlowCtx(ctx) {
    this._glowCtx = ctx;
  }

  /**
   * Spawn a quality-tier particle in a region (for procedural generation).
   * Quality: 0=base, 1=common, 2=rare, 3=epic, 4=legendary
   * Returns the value multiplier for this quality tier.
   */
  spawnQualityParticle(regionId, quality, x, y, vx, vy) {
    const entry = this.regions.get(regionId);
    if (!entry || entry.particles.length >= MAX_PER_REGION) return 1.0;

    // Map quality to sprite type
    const spriteTypes = ['mote_base', 'mote_common', 'mote_rare', 'mote_epic', 'mote_legendary'];
    const spriteType = spriteTypes[Math.min(quality, 4)] || 'mote_base';
    const sprite = this.spriteManager.getSprite(spriteType);
    if (!sprite) return 1.0;

    const size = sprite.minSize + Math.random() * (sprite.maxSize - sprite.minSize);

    entry.particles.push({
      x,
      y,
      vx: vx || 0,
      vy: vy || 0,
      size,
      brightness: 0.5 + Math.random() * 0.4,
      type: spriteType,
      sprite,
      attracted: false,
      quality, // Track quality tier for absorption value calculation
    });

    // Return value multiplier for this quality
    const multipliers = [1.0, 1.5, 2.5, 5, 10];
    return multipliers[Math.min(quality, 4)];
  }

  /**
   * Get the value multiplier for a particle's quality tier.
   */
  static getQualityMultiplier(quality) {
    const multipliers = [1.0, 1.5, 2.5, 5, 10];
    return multipliers[Math.min(quality, 4)] || 1.0;
  }
}

