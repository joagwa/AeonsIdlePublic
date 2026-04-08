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
    // Mass-based gravity multiplier (set externally each frame)
    this._massGravityMult = 1;
    // Spawn flash tracking: [{x, y, age, maxAge}]
    this._spawnFlashes = [];
    this._qualityLevel = 0;
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

  /** Spawn a single particle, biased toward gravity center when attraction is active. */
  spawnParticle(regionId, type) {
    const entry = this.regions.get(regionId);
    if (!entry || entry.particles.length >= MAX_PER_REGION) return;

    const bounds = entry.config.worldBounds;
    const actualType = (type === 'mote' && this._qualityLevel > 0)
      ? this._selectQualityType()
      : type;
    const sprite = this.spriteManager.getSprite(actualType);
    if (!sprite) return;

    const size = sprite.minSize + Math.random() * (sprite.maxSize - sprite.minSize);

    let x, y;
    const attraction = entry.attraction;
    // 60% chance to spawn within ~2× gravity radius of attraction center
    if (attraction && Math.random() < 0.6) {
      const spawnRadius = (attraction.gravityRadius || 300) * 2;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * spawnRadius; // sqrt for uniform area distribution
      x = attraction.targetX + Math.cos(angle) * dist;
      y = attraction.targetY + Math.sin(angle) * dist;
      // Clamp within region bounds with a small margin to avoid edge clustering
      const margin = 50;
      x = Math.max(bounds.x + margin, Math.min(bounds.x + bounds.w - margin, x));
      y = Math.max(bounds.y + margin, Math.min(bounds.y + bounds.h - margin, y));
    } else {
      x = bounds.x + Math.random() * bounds.w;
      y = bounds.y + Math.random() * bounds.h;
    }

    entry.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 2 * 1.5 + 0.5 * Math.sign(Math.random() - 0.5),
      vy: (Math.random() - 0.5) * 2 * 1.5 + 0.5 * Math.sign(Math.random() - 0.5),
      size,
      brightness: 0.4 + Math.random() * 0.5,
      type: actualType,
      sprite,
      attracted: false,
    });

    // Tiny spawn flash
    this._spawnFlashes.push({ x, y, age: 0, maxAge: 0.3 });
  }

  /**
   * Spawn a replacement particle — biased toward gravity zone, with edge fallback.
   */
  _spawnEdgeParticle(entry) {
    if (entry.particles.length >= MAX_PER_REGION) return;

    const bounds = entry.config.worldBounds;
    const types = entry.config.particleTypes;
    const rawType = types[Math.floor(Math.random() * types.length)];
    const actualType = (rawType === 'mote' && this._qualityLevel > 0)
      ? this._selectQualityType()
      : rawType;
    const sprite = this.spriteManager.getSprite(actualType);
    if (!sprite) return;

    const size = sprite.minSize + Math.random() * (sprite.maxSize - sprite.minSize);

    let x, y;
    const attraction = entry.attraction;
    // 50% chance to spawn near gravity zone (but outside the tight pull radius)
    if (attraction && Math.random() < 0.5) {
      const innerR = (attraction.gravityRadius || 300) * 0.8;
      const outerR = (attraction.gravityRadius || 300) * 2.5;
      const angle = Math.random() * Math.PI * 2;
      const dist = innerR + Math.random() * (outerR - innerR);
      x = attraction.targetX + Math.cos(angle) * dist;
      y = attraction.targetY + Math.sin(angle) * dist;
      const margin = 50;
      x = Math.max(bounds.x + margin, Math.min(bounds.x + bounds.w - margin, x));
      y = Math.max(bounds.y + margin, Math.min(bounds.y + bounds.h - margin, y));
    } else {
      // Spawn in outer ring (15% margin from each edge), distributed proportionally by perimeter
      const marginX = bounds.w * 0.15;
      const marginY = bounds.h * 0.15;
      const perimeter = 2 * (bounds.w + bounds.h);
      const r = Math.random() * perimeter;
      if (r < bounds.w) {
        x = bounds.x + Math.random() * bounds.w;
        y = bounds.y + Math.random() * marginY;
      } else if (r < 2 * bounds.w) {
        x = bounds.x + Math.random() * bounds.w;
        y = bounds.y + bounds.h - Math.random() * marginY;
      } else if (r < 2 * bounds.w + bounds.h) {
        x = bounds.x + Math.random() * marginX;
        y = bounds.y + Math.random() * bounds.h;
      } else {
        x = bounds.x + bounds.w - Math.random() * marginX;
        y = bounds.y + Math.random() * bounds.h;
      }
    }

    entry.particles.push({ x, y, vx: 0, vy: 0, size, brightness: 0.4 + Math.random() * 0.4, type: actualType, sprite, attracted: false });

    // Tiny spawn flash
    this._spawnFlashes.push({ x, y, age: 0, maxAge: 0.25 });
  }

  /** Update all particles: position, wrapping, flicker, attraction homing, absorption. */
  update(dt) {
    // Age and prune spawn flashes
    for (let i = this._spawnFlashes.length - 1; i >= 0; i--) {
      this._spawnFlashes[i].age += dt;
      if (this._spawnFlashes[i].age >= this._spawnFlashes[i].maxAge) {
        this._spawnFlashes.splice(i, 1);
      }
    }

    for (const [, entry] of this.regions) {
      const bounds = entry.config.worldBounds;
      const speed = entry.params.motionSpeed;
      const attraction = entry.attraction;
      const aParms = entry.attractionParams || { conversionRate: 1, speedMultiplier: 1 };

      // --- Move particles ---
      const gravRadius = attraction ? (attraction.gravityRadius || 600) : 0;
      const massMult = this._massGravityMult;

      for (const p of entry.particles) {
        if (p.attracted && attraction) {
          // Cubic distance-based speed with mass scaling: strong core, steep dropoff
          const dx = attraction.targetX - p.x;
          const dy = attraction.targetY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            const t = Math.max(0, 1 - dist / gravRadius); // 0 at edge, 1 at center
            const minSpd = 2;
            const maxSpd = 180;
            // Cubic falloff: t³ creates a strong inner zone with steep outer dropoff
            const moveSpeed = (minSpd + (maxSpd - minSpd) * t * t * t) * aParms.speedMultiplier * massMult;
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
          this._spawnEdgeParticle(entry); // replace to maintain density
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
        const r = Math.max(0.5, p.size / 2);
        const cx = sx + r;
        const cy = sy + r;
        const alpha = p.brightness * bri;
        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha));
        ctx.fillStyle = p.attracted ? '#b8d4ff' : p.sprite.baseColor;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Glow on separate context (attracted particles always glow when close to target)
        const shouldGlow = p.sprite.glowRadius > 0 || p.attracted;
        if (shouldGlow && this._glowCtx) {
          this._glowCtx.globalAlpha = Math.max(0.05, Math.min(0.7, alpha * 0.5));
          this._glowCtx.fillStyle = p.attracted ? '#c0dcff' : p.sprite.baseColor;
          const gr = p.attracted ? r : p.sprite.glowRadius;
          this._glowCtx.beginPath();
          this._glowCtx.arc(cx, cy, r + gr, 0, Math.PI * 2);
          this._glowCtx.fill();
        }
      }
    }

    // Draw spawn flashes
    for (const flash of this._spawnFlashes) {
      if (!camera.isVisible(flash.x, flash.y, 6, 6)) continue;
      const { sx, sy } = camera.worldToScreen(flash.x, flash.y);
      const t = 1 - flash.age / flash.maxAge; // 1→0 over lifetime
      ctx.globalAlpha = t * 0.6;
      ctx.fillStyle = '#ffffff';
      const fr = 1 + t * 2;
      ctx.beginPath();
      ctx.arc(sx, sy, fr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    if (this._glowCtx) this._glowCtx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // Quality level API
  // ---------------------------------------------------------------

  /** Set the quality level for mote spawning (0 = base only, up to 5 = all tiers). */
  setQualityLevel(level) {
    this._qualityLevel = Math.max(0, Math.min(8, level));
  }

  /**
   * Pick a quality-tiered sprite type based on current quality level.
   * Higher quality levels unlock rarer tiers with increasing probability.
   */
  _selectQualityType() {
    const distributions = [
      [1.00, 0.00, 0.00, 0.00, 0.00],  // Lv0: all base
      [0.70, 0.30, 0.00, 0.00, 0.00],  // Lv1
      [0.50, 0.30, 0.20, 0.00, 0.00],  // Lv2
      [0.30, 0.25, 0.25, 0.20, 0.00],  // Lv3
      [0.20, 0.20, 0.20, 0.20, 0.20],  // Lv4
      [0.10, 0.15, 0.25, 0.25, 0.25],  // Lv5
      [0.05, 0.10, 0.25, 0.30, 0.30],  // Lv6
      [0.03, 0.07, 0.20, 0.30, 0.40],  // Lv7
      [0.02, 0.05, 0.13, 0.30, 0.50],  // Lv8: half legendary
    ];
    const dist = distributions[Math.min(this._qualityLevel, 8)];
    const r = Math.random();
    let cumulative = 0;
    const types = ['mote_base', 'mote_common', 'mote_rare', 'mote_epic', 'mote_legendary'];
    for (let i = 0; i < dist.length; i++) {
      cumulative += dist[i];
      if (r < cumulative) return types[i];
    }
    return 'mote_base';
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
   * Set the mass-based gravity multiplier (called each frame from renderer).
   * Scales pull speed: 1.0 = base, higher = stronger pull.
   */
  setMassGravityMultiplier(mult) {
    this._massGravityMult = mult;
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

