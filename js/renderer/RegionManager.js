/**
 * RegionManager — Manages 5 region activation states and fade-in transitions.
 */

const FADE_DURATION = 2; // seconds

export class RegionManager {
  constructor(EventBus, particleSystem) {
    this.bus = EventBus;
    this.particleSystem = particleSystem;
    /** @type {Map<string, object>} */
    this.regionStates = new Map();

    this.bus.on('milestone:triggered', (data) => {
      for (const [, rs] of this.regionStates) {
        if (
          rs.config.activationMilestone &&
          rs.config.activationMilestone === data.milestoneId &&
          rs.state === 'DARK'
        ) {
          this.activateRegion(rs.regionId);
        }
      }
    });
  }

  /** Initialize region states from config. Active regions start fully lit. */
  loadRegions(regions) {
    this.regionStates.clear();
    for (const region of regions) {
      const isActive = region.initiallyActive === true;
      this.regionStates.set(region.regionId, {
        regionId: region.regionId,
        config: region,
        state: isActive ? 'ACTIVE' : 'DARK',
        activationLevel: isActive ? 1 : 0,
        fadeStartTime: null,
      });
    }
  }

  /** Advance fade-in transitions. */
  update(dt) {
    for (const [, rs] of this.regionStates) {
      if (rs.state !== 'FADING_IN') continue;

      rs.activationLevel += dt / FADE_DURATION;
      if (rs.activationLevel >= 1) {
        rs.activationLevel = 1;
        rs.state = 'ACTIVE';
        this.bus.emit('region:activated', {
          regionId: rs.regionId,
          regionName: rs.config.name,
        });
        // Spawn initial particles for the newly activated region
        const target = Math.min(rs.config.maxParticles || 200, 200);
        this.particleSystem.spawnInitialParticles(rs.regionId, target);
      }
    }
  }

  /** Draw region backgrounds with activation alpha. */
  draw(ctx, camera, viewW, viewH) {
    for (const [, rs] of this.regionStates) {
      if (rs.state === 'DARK') continue;

      const b = rs.config.worldBounds;
      if (!camera.isVisible(b.x, b.y, b.w, b.h)) continue;

      const { sx, sy } = camera.worldToScreen(b.x, b.y);
      ctx.globalAlpha = rs.activationLevel * 0.35;
      ctx.fillStyle = rs.config.baseColor;
      ctx.fillRect(Math.round(sx), Math.round(sy), b.w, b.h);
    }
    ctx.globalAlpha = 1;
  }

  /** Begin fade-in for a region. */
  activateRegion(regionId) {
    const rs = this.regionStates.get(regionId);
    if (!rs || rs.state !== 'DARK') return;

    rs.state = 'FADING_IN';
    rs.activationLevel = 0;
    rs.fadeStartTime = performance.now();
  }

  /** Return all region states as an array. */
  getRegions() {
    return Array.from(this.regionStates.values());
  }

  /** Check if a region is active or fading in. */
  isRegionActive(regionId) {
    const rs = this.regionStates.get(regionId);
    return rs ? rs.state === 'ACTIVE' || rs.state === 'FADING_IN' : false;
  }
}
