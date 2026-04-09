/**
 * CanvasRenderer — Master renderer orchestrating all sub-renderers.
 * Owns the main and glow canvas contexts and drives per-frame updates.
 */

import { SpriteManager } from './SpriteManager.js?v=27e9987';
import { Camera } from './Camera.js?v=27e9987';
import { ParticleSystem } from './ParticleSystem.js?v=27e9987';
import { RegionManager } from './RegionManager.js?v=27e9987';
import { FloatingNumbers } from './FloatingNumbers.js?v=27e9987';

// Star visual definitions by stage
const STAR_VISUALS = {
  main_sequence: { color: '#ffffff', size: 4, glow: false },
  red_giant:     { color: '#ff6030', size: 6, glow: true },
  supernova:     { color: '#ffffff', size: 8, glow: true },
  neutron_star:  { color: '#8090c0', size: 2, glow: false },
};

export class CanvasRenderer {
  constructor(EventBus) {
    this.bus = EventBus;

    this.mainCanvas = null;
    this.glowCanvas = null;
    this.mainCtx = null;
    this.glowCtx = null;
    this.dpr = 1;

    this.camera = null;
    this.spriteManager = null;
    this.particleSystem = null;
    this.regionManager = null;
    this.floatingNumbers = null;

    this.glowEnabled = true;
    this.canvasConfig = null;
    this.lastFrameTime = 0;

    // Stars registered via events
    this._stars = new Map();

    // Directional indicators for off-screen region activations
    this._indicators = [];

    // Home object absorption pulse (0 = idle, >0 = pulsing)
    this._homeObjectPulse = 0;

    // Mote controller reference (set via setMoteController)
    this._moteController = null;
    this._gravityBaseRadius = 0; // set when upg_gravitationalPull purchased
    this._pendingGravityLevel = 0; // deferred if canvasConfig not ready on purchase

    // Mass-based gravity scaling state
    this._currentMass = 0;

    // Conversion rate slider (0..1, default 1 = 100%)
    this._conversionRate = 1;

    // Visual threshold state (home object evolves with mass)
    this._thresholdLevel = 0;
    this._visualSize = 4;
    this._visualTargetSize = 4;
    this._visualGlow = 3;
    this._visualTargetGlow = 3;
    this._visualColor = '#c8e0ff';
    this._visualFlash = 0; // 0..1, fades out
    this._massConversionFlash = 0; // golden flash for energy→mass conversion
    this._visualThresholds = null; // loaded from epoch config

    this._resizeObserver = null;
    this._darkMatterActive = false;

    /** @type {import('../engine/DarkMatterSystem.js?v=27e9987').DarkMatterSystem|null} */
    this._darkMatterSystem = null;

    // Particle storm (temporary boost from milestone reward)
    this._particleStormActive = false;
    this._particleStormTimer = 0;   // seconds remaining
    this._stormGravityMult = 1;
  }

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------

  /**
   * Set up canvases, sub-systems, and event subscriptions.
   * @param {HTMLCanvasElement} mainCanvas
   * @param {HTMLCanvasElement} glowCanvas
   */
  init(mainCanvas, glowCanvas) {
    this.mainCanvas = mainCanvas;
    this.glowCanvas = glowCanvas;
    this.mainCtx = mainCanvas.getContext('2d');
    this.glowCtx = glowCanvas.getContext('2d');

    this.dpr = window.devicePixelRatio || 1;
    this._resizeCanvases();

    // Sub-systems
    this.spriteManager = new SpriteManager();
    this.camera = new Camera(this.bus);
    this.particleSystem = new ParticleSystem(this.spriteManager);
    this.regionManager = new RegionManager(this.bus, this.particleSystem);
    this.floatingNumbers = new FloatingNumbers();

    this.camera.attach(mainCanvas);
    this.particleSystem.setGlowCtx(this.glowCtx);

    // Resize on viewport change
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvases());
    this._resizeObserver.observe(mainCanvas);

    // --- EventBus subscriptions ---
    this.bus.on('resource:updated', (data) => this._onResourceUpdated(data));
    this.bus.on('star:created', (data) => this._onStarCreated(data));
    this.bus.on('star:stage:changed', (data) => this._onStarStageChanged(data));
    this.bus.on('region:activated', (data) => this._onRegionActivated(data));
    this.bus.on('upgrade:purchased', (data) => this._onUpgradePurchased(data));
    this.bus.on('visual:threshold:changed', (data) => {
      this._visualFlash = 1.0;
      if (this.canvasConfig?.homeObject) {
        this.canvasConfig.homeObject.baseColor = data.color;
      }
      this._visualTargetSize = data.size;
      this._visualTargetGlow = data.glowRadius;
      this._visualColor = data.color;
      if (data.particleBoost && this.particleSystem) {
        this.particleSystem.spawnInitialParticles('void', data.particleBoost);
      }
    });
    this.bus.on('settings:changed', (data) => {
      if (data.key === 'glowEnabled') this.setGlowEnabled(data.value);
    });
    this.bus.on('mass:converted', () => {
      // Trigger golden flash for energy→mass conversion
      this._massConversionFlash = Math.min(1, this._massConversionFlash + 0.5);
    });
    this.bus.on('milestone:triggered', (data) => {
      if (data.milestoneId === 'ms_gasCloud') {
        this._darkMatterActive = true;
        // Inject dark matter motes into the void region particle types
        const voidRegion = this.canvasConfig?.regions?.find(r => r.regionId === 'void');
        if (voidRegion && !voidRegion.particleTypes.includes('darkMote')) {
          voidRegion.particleTypes.push('darkMote');
        }
        // Seed some dark motes immediately
        this.particleSystem?.spawnInitialParticles('void', 80);
      }
    });
  }

  // ---------------------------------------------------------------
  // Canvas sizing
  // ---------------------------------------------------------------

  _resizeCanvases() {
    const w = this.mainCanvas.clientWidth;
    const h = this.mainCanvas.clientHeight;
    if (w === 0 || h === 0) return;

    for (const canvas of [this.mainCanvas, this.glowCanvas]) {
      canvas.width = w * this.dpr;
      canvas.height = h * this.dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }

    if (this.camera) {
      this.camera.setViewSize(w, h);
      // Re-center camera on home object after resize
      const ho = this.canvasConfig?.homeObject;
      if (ho) {
        this.camera.x = ho.worldX - w / 2;
        this.camera.y = ho.worldY - h / 2;
      }
    }
  }

  // ---------------------------------------------------------------
  // Epoch config loading
  // ---------------------------------------------------------------

  /** Load a full epoch canvas config (regions, sprites, home object, etc). */
  loadEpochConfig(config) {
    this.canvasConfig = config;

    this.camera.setUniverseSize(config.universeWidth, config.universeHeight);
    this.spriteManager.loadEpochSprites(config);
    this.particleSystem.loadRegions(config.regions);
    this.regionManager.loadRegions(config.regions);

    // Center camera on home object
    if (config.homeObject) {
      this.camera.x = config.homeObject.worldX - this.camera.viewW / 2;
      this.camera.y = config.homeObject.worldY - this.camera.viewH / 2;
      this.camera.clamp();
    }

    // Spawn particles in initially active regions
    for (const region of config.regions) {
      if (region.initiallyActive) {
        this.particleSystem.spawnInitialParticles(region.regionId, 250);
      }
    }

    this._stars.clear();
    this._indicators = [];

    // Load visual thresholds from canvas config module (imported by caller)
    this._visualThresholds = config.visualThresholds || null;
    // Set initial visual state from threshold level 0
    if (this._visualThresholds && this._visualThresholds.length > 0) {
      const t = this._visualThresholds[0];
      this._visualSize = t.size;
      this._visualTargetSize = t.size;
      this._visualGlow = t.glowRadius;
      this._visualTargetGlow = t.glowRadius;
      this._visualColor = t.color;
      if (config.homeObject) {
        config.homeObject.baseColor = t.color;
        config.homeObject.baseSize = t.size;
        config.homeObject.glowRadius = t.glowRadius;
      }
    }
    this._thresholdLevel = 0;

    // Apply any gravity upgrade that fired before canvasConfig was ready
    if (this._pendingGravityLevel > 0) {
      this._onUpgradePurchased({ upgradeId: 'upg_gravitationalPull', level: this._pendingGravityLevel });
      this._pendingGravityLevel = 0;
    }
  }

  // ---------------------------------------------------------------
  // Frame rendering (called by GameLoop)
  // ---------------------------------------------------------------

  /** Main render loop entry point. */
  onFrame(ts) {
    const dt = this.lastFrameTime ? (ts - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = ts;
    const clampedDt = Math.min(dt, 0.1);

    const viewW = this.mainCanvas.clientWidth;
    const viewH = this.mainCanvas.clientHeight;

    // Clear
    this.mainCtx.clearRect(0, 0, viewW, viewH);
    if (this.glowEnabled) this.glowCtx.clearRect(0, 0, viewW, viewH);

    if (!this.canvasConfig) return;

    // Always center camera on home object
    const ho = this.canvasConfig.homeObject;
    if (ho && this.camera) {
      this.camera.x = ho.worldX - viewW / 2;
      this.camera.y = ho.worldY - viewH / 2;
    }

    // Sync home object position from mote controller
    if (this._moteController && this.canvasConfig.homeObject) {
      this.canvasConfig.homeObject.worldX = this._moteController.worldX;
      this.canvasConfig.homeObject.worldY = this._moteController.worldY;
      // Update particle attraction target in ALL regions to follow the mote
      if (this._moteController.enabled) {
        const baseRadius = this._gravityBaseRadius || 100;
        const tractorRange = this._moteController.tractorBeamRange || 0;
        // Mass-based radius expansion: +50% radius per 100 mass, logarithmic scaling
        const massBonus = this._currentMass > 0 ? Math.log10(1 + this._currentMass) * 0.4 : 0;
        const effectiveRadius = (baseRadius + tractorRange) * (1 + massBonus) * this._stormGravityMult;
        this.particleSystem.updateAttractionTargetAll(
          this._moteController.worldX,
          this._moteController.worldY,
          effectiveRadius
        );
        // Mass-based speed multiplier: 1.0 base, +10% per log10(mass)
        const massSpeedMult = 1 + (this._currentMass > 0 ? Math.log10(1 + this._currentMass) * 0.1 : 0);
        this.particleSystem.setMassGravityMultiplier(massSpeedMult);
        // Apply tractor beam speed/conversion params to all regions
        if (tractorRange > 0) {
          for (const region of this.canvasConfig.regions) {
            this.particleSystem.setAttractionParams(region.regionId, {
              conversionRate: this._moteController.tractorBeamStrength,
              speedMultiplier: this._moteController.tractorBeamStrength,
            });
          }
        }
      }
    }

    // Update
    this.regionManager.update(clampedDt);
    this.particleSystem.update(clampedDt);
    this.floatingNumbers.update(clampedDt);

    // Decay absorption pulse
    if (this._homeObjectPulse > 0) {
      this._homeObjectPulse = Math.max(0, this._homeObjectPulse - clampedDt * 4);
    }

    // Decay particle storm timer
    if (this._particleStormActive) {
      this._particleStormTimer -= clampedDt;
      if (this._particleStormTimer <= 0) {
        this._particleStormActive = false;
        this._stormGravityMult = 1;
      }
    }

    // Lerp visual size and glow toward targets
    const lerpSpeed = 2.0;
    this._visualSize += (this._visualTargetSize - this._visualSize) * Math.min(1, lerpSpeed * clampedDt);
    this._visualGlow += (this._visualTargetGlow - this._visualGlow) * Math.min(1, lerpSpeed * clampedDt);
    // Decay threshold flash
    if (this._visualFlash > 0) {
      this._visualFlash = Math.max(0, this._visualFlash - clampedDt * 1.5);
    }
    // Decay mass conversion flash
    if (this._massConversionFlash > 0) {
      this._massConversionFlash = Math.max(0, this._massConversionFlash - clampedDt * 5);
    }

    // Draw region backgrounds
    this.regionManager.draw(this.mainCtx, this.camera, viewW, viewH);

    // Subtle dark matter tint over the void when dark matter is active
    if (this._darkMatterActive && this.canvasConfig) {
      const voidRegion = this.canvasConfig.regions?.find(r => r.regionId === 'void');
      if (voidRegion) {
        const b = voidRegion.worldBounds;
        const { sx, sy } = this.camera.worldToScreen(b.x, b.y);
        this.mainCtx.globalAlpha = 0.18;
        this.mainCtx.fillStyle = '#110024';
        this.mainCtx.fillRect(Math.round(sx), Math.round(sy), b.w, b.h);
        this.mainCtx.globalAlpha = 1;
      }
    }

    // Draw dark matter nodes (barely visible in void; wave rings rendered here too)
    if (this._darkMatterActive) {
      this._drawDarkMatterNodes(this.mainCtx);
    }

    // Draw particles
    this.particleSystem.draw(this.mainCtx, this.camera, viewW, viewH);

    // Draw home object
    this._drawHomeObject(this.mainCtx);

    // Draw stars
    this._drawStars(this.mainCtx);

    // Draw floating numbers (screen-space)
    this.floatingNumbers.draw(this.mainCtx);

    // Draw directional indicators
    this._drawIndicators(this.mainCtx, viewW, viewH);

    // Draw controls hint overlay (bottom-left of canvas)
    this._drawControlsHint(this.mainCtx, viewW, viewH);

    // Draw virtual joystick overlay (screen-space, on top of everything)
    this._drawJoystick(this.mainCtx);
  }

  // ---------------------------------------------------------------
  // Home object
  // ---------------------------------------------------------------

  _drawHomeObject(ctx) {
    const ho = this.canvasConfig?.homeObject;
    if (!ho) {
      if (window.AEONS_DEBUG) console.warn('[CanvasRenderer] Home object not found in config');
      return;
    }

    const visible = this.camera.isVisible(ho.worldX - ho.hitRadius, ho.worldY - ho.hitRadius, ho.hitRadius * 2, ho.hitRadius * 2);
    if (!visible) {
      if (window.AEONS_DEBUG && Math.random() < 0.01) {
        console.warn(`[CanvasRenderer] Home object outside viewport. HO: (${ho.worldX}, ${ho.worldY}), Camera: (${this.camera.x}, ${this.camera.y}), View: ${this.camera.viewW}x${this.camera.viewH}`);
      }
      return;
    }

    const { sx, sy } = this.camera.worldToScreen(ho.worldX, ho.worldY);
    const pulse = this._homeObjectPulse;
    const s = this._visualSize + pulse * 3;
    const color = this._visualColor || ho.baseColor;

    // Draw threshold flash overlay (before home object, full viewport)
    if (this._visualFlash > 0.01) {
      const viewW = this.mainCanvas.clientWidth;
      const viewH = this.mainCanvas.clientHeight;
      ctx.save();
      ctx.globalAlpha = this._visualFlash * 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }

    // Bright core circle
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, s, 0, Math.PI * 2);
    ctx.fill();

    // Cross-hair glow dots
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    ctx.fillRect(Math.round(sx - s - 2), Math.round(sy), 2, 1);
    ctx.fillRect(Math.round(sx + s + 1), Math.round(sy), 2, 1);
    ctx.fillRect(Math.round(sx), Math.round(sy - s - 2), 1, 2);
    ctx.fillRect(Math.round(sx), Math.round(sy + s + 1), 1, 2);

    // Pulse ring
    if (pulse > 0.05) {
      const ringR = (s + 6) + pulse * 12;
      ctx.globalAlpha = pulse * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mass conversion golden flash
    if (this._massConversionFlash > 0.01) {
      const flashAlpha = this._massConversionFlash * 0.7;
      const flashR = s + 4 + this._massConversionFlash * 8;
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(sx, sy, flashR, 0, Math.PI * 2);
      ctx.fill();
      // Outer golden ring
      ctx.globalAlpha = flashAlpha * 0.6;
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, flashR + 4, 0, Math.PI * 2);
      ctx.stroke();
      // Golden glow on glow canvas
      if (this.glowEnabled) {
        this.glowCtx.globalAlpha = flashAlpha * 0.5;
        this.glowCtx.fillStyle = '#ffd700';
        const glowR = flashR + 10;
        this.glowCtx.beginPath();
        this.glowCtx.arc(sx, sy, glowR, 0, Math.PI * 2);
        this.glowCtx.fill();
        this.glowCtx.globalAlpha = 1;
      }
    }

    // Storm visual: pulsing cyan ring when particle storm is active
    if (this._particleStormActive) {
      const stormPulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
      const stormR = s + 10 + stormPulse * 8;
      ctx.globalAlpha = 0.35 + stormPulse * 0.35;
      ctx.strokeStyle = '#00e8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, stormR, 0, Math.PI * 2);
      ctx.stroke();
      const stormR2 = s + 22 + stormPulse * 12;
      ctx.globalAlpha = 0.15 + stormPulse * 0.15;
      ctx.strokeStyle = '#80ffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, stormR2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Glow on glow canvas
    if (this.glowEnabled) {
      const gr = this._visualGlow + pulse * 6;
      this.glowCtx.globalAlpha = 0.4 + pulse * 0.4;
      this.glowCtx.fillStyle = color;
      this.glowCtx.beginPath();
      this.glowCtx.arc(sx, sy, s + gr, 0, Math.PI * 2);
      this.glowCtx.fill();
      this.glowCtx.globalAlpha = 1;
    }

    // Direction indicator (small line showing facing angle)
    if (this._moteController?.enabled) {
      const mc = this._moteController;
      const dirLen = s + 10;
      const dx = Math.cos(mc.angle) * dirLen;
      const dy = Math.sin(mc.angle) * dirLen;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx, sy + dy);
      ctx.stroke();

      // Small arrowhead
      const aLen = 4;
      const aAngle = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx + dx, sy + dy);
      ctx.lineTo(
        sx + dx - Math.cos(mc.angle - aAngle) * aLen,
        sy + dy - Math.sin(mc.angle - aAngle) * aLen
      );
      ctx.moveTo(sx + dx, sy + dy);
      ctx.lineTo(
        sx + dx - Math.cos(mc.angle + aAngle) * aLen,
        sy + dy - Math.sin(mc.angle + aAngle) * aLen
      );
      ctx.stroke();
    }

    // Tractor beam visual (pulsing dashed circle)
    if (this._moteController?.tractorBeamRange > 0) {
      const range = this._moteController.tractorBeamRange;
      const now = performance.now();
      const breathe = Math.sin(now * 0.003) * 0.04 + 0.16;
      const radiusOsc = range + Math.sin(now * 0.002) * 4;

      ctx.save();
      ctx.globalAlpha = breathe;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, radiusOsc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  /** Returns screen position of the home object. */
  getHomeObjectScreenPos() {
    const ho = this.canvasConfig?.homeObject;
    if (!ho) return { x: 0, y: 0 };
    const { sx, sy } = this.camera.worldToScreen(ho.worldX, ho.worldY);
    return { x: sx, y: sy };
  }

  // ---------------------------------------------------------------
  // Stars
  // ---------------------------------------------------------------

  _onStarCreated(data) {
    this._stars.set(data.starId, {
      starId: data.starId,
      slot: data.slot || 0,
      stage: 'main_sequence',
      stageProgress: 0,
    });
  }

  _onStarStageChanged(data) {
    const star = this._stars.get(data.starId);
    if (star) {
      star.stage = data.newStage;
      star.stageProgress = data.stageProgress || 0;
    }
  }

  /**
   * Draw dark matter nodes (barely-visible void anomalies) and their wave rings.
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawDarkMatterNodes(ctx) {
    if (!this._darkMatterSystem) return;
    const nodes = this._darkMatterSystem.getNodes();
    if (nodes.length === 0) return;

    ctx.save();
    for (const node of nodes) {
      const { sx, sy } = this.camera.worldToScreen(node.x, node.y);

      // Expanding wave ring — subtle dark-purple stroke
      if (node.pulsing && node.waveAlpha > 0) {
        ctx.globalAlpha = node.waveAlpha * 0.9;
        ctx.strokeStyle = '#5a0090';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, node.waveRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary, slightly larger, more transparent ring
        ctx.globalAlpha = node.waveAlpha * 0.4;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, node.waveRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      const op = node.displayOpacity || 0.10;
      const r = node.nodeRadius || 6;

      // Dark core (slightly darker than the void background)
      ctx.globalAlpha = op * 1.2;
      ctx.fillStyle = '#060010';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Very faint outer glow ring to hint at presence
      ctx.globalAlpha = op * 0.5;
      ctx.strokeStyle = '#3a0055';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawStars(ctx) {
    if (this._stars.size === 0 || !this.canvasConfig) return;

    // Place stars in the Stellar Forge region
    const forgeRegion = this.canvasConfig.regions.find(
      (r) => r.regionId === 'stellarForge'
    );
    if (!forgeRegion) return;

    const bounds = forgeRegion.worldBounds;
    let idx = 0;

    for (const [, star] of this._stars) {
      const vis = STAR_VISUALS[star.stage] || STAR_VISUALS.main_sequence;
      // Distribute stars in a grid within the forge region
      const col = idx % 5;
      const row = Math.floor(idx / 5);
      const starX = bounds.x + 80 + col * 120;
      const starY = bounds.y + 200 + row * 200;
      idx++;

      if (!this.camera.isVisible(starX - vis.size, starY - vis.size, vis.size * 2, vis.size * 2)) continue;

      const { sx, sy } = this.camera.worldToScreen(starX, starY);

      // Star body
      ctx.fillStyle = vis.color;
      ctx.globalAlpha = 1;
      ctx.fillRect(
        Math.round(sx - vis.size / 2),
        Math.round(sy - vis.size / 2),
        vis.size,
        vis.size
      );

      // Progress arc
      const progress = star.stageProgress || 0;
      if (progress > 0 && progress < 1) {
        ctx.beginPath();
        ctx.arc(sx, sy, vis.size + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = vis.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Glow on glow canvas
      if (vis.glow && this.glowEnabled) {
        this.glowCtx.globalAlpha = 0.5;
        this.glowCtx.fillStyle = vis.color;
        this.glowCtx.fillRect(
          Math.round(sx - vis.size),
          Math.round(sy - vis.size),
          vis.size * 2,
          vis.size * 2
        );
        this.glowCtx.globalAlpha = 1;
      }
    }

    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // Directional indicators
  // ---------------------------------------------------------------

  _onRegionActivated(data) {
    if (!this.canvasConfig) return;
    const region = this.canvasConfig.regions.find(
      (r) => r.regionId === data.regionId
    );
    if (!region) return;

    // If gravitational pull is active, enable attraction in the new region too
    if (this._gravityBaseRadius > 0 && this.canvasConfig.homeObject) {
      const ho = this.canvasConfig.homeObject;
      const tractorRange = this._moteController?.tractorBeamRange || 0;
      this.particleSystem.enableAttraction(
        data.regionId, ho.worldX, ho.worldY,
        this._gravityBaseRadius + tractorRange
      );
    }

    const cx = region.worldBounds.x + region.worldBounds.w / 2;
    const cy = region.worldBounds.y + region.worldBounds.h / 2;

    if (!this.camera.isVisible(cx - 1, cy - 1, 2, 2)) {
      this._indicators.push({
        regionName: data.regionName || region.name,
        worldX: cx,
        worldY: cy,
        createdAt: performance.now(),
        duration: 3000,
      });
    }
  }

  _drawIndicators(ctx, viewW, viewH) {
    const now = performance.now();
    for (let i = this._indicators.length - 1; i >= 0; i--) {
      const ind = this._indicators[i];
      const elapsed = now - ind.createdAt;
      if (elapsed > ind.duration) {
        this._indicators.splice(i, 1);
        continue;
      }

      const alpha = 1 - elapsed / ind.duration;
      const { sx, sy } = this.camera.worldToScreen(ind.worldX, ind.worldY);

      // Clamp to screen edge
      const pad = 30;
      const edgeX = Math.max(pad, Math.min(viewW - pad, sx));
      const edgeY = Math.max(pad, Math.min(viewH - pad, sy));

      // Arrow direction
      const angle = Math.atan2(sy - edgeY, sx - edgeX);

      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha * 0.8;

      // Draw arrow
      ctx.fillStyle = '#a0c4ff';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Label
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = '#a0c4ff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ind.regionName, edgeX, edgeY - 12);
      ctx.textAlign = 'start';
    }
    ctx.globalAlpha = 1;
  }

  _drawControlsHint(ctx, viewW, viewH) {
    if (!this._moteController) return;
    const hint = this._moteController.getHintState();
    if (!hint.visible || hint.alpha <= 0) return;

    const hintText = this._moteController.isTouchDevice
      ? 'Touch & drag to move'
      : 'WASD / \u2191\u2193\u2190\u2192 or drag to move';

    ctx.save();
    ctx.globalAlpha = hint.alpha;
    ctx.fillStyle = '#a0c4ff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(hintText, 14, viewH - 18);
    ctx.restore();
  }

  /**
   * Draw the virtual joystick overlay in screen space.
   * Renders an outer boundary ring and a draggable thumb at the current
   * pointer position (clamped to the boundary radius).
   */
  _drawJoystick(ctx) {
    const mc = this._moteController;
    if (!mc?.enabled) return;
    const js = mc.getJoystickState();
    if (!js.active) return;

    const { originX, originY, currentX, currentY, maxRadius } = js;

    // Clamp thumb to boundary ring
    const dx = currentX - originX;
    const dy = currentY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const thumbDist = Math.min(dist, maxRadius);
    const thumbX = dist > 0 ? originX + (dx / dist) * thumbDist : originX;
    const thumbY = dist > 0 ? originY + (dy / dist) * thumbDist : originY;

    ctx.save();

    // Outer boundary ring fill
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#aaccff';
    ctx.beginPath();
    ctx.arc(originX, originY, maxRadius, 0, Math.PI * 2);
    ctx.fill();

    // Outer boundary ring stroke
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#aaccff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(originX, originY, maxRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Line from origin to thumb
    if (dist > 6) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#aaccff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(thumbX, thumbY);
      ctx.stroke();
    }

    // Origin centre dot
    ctx.globalAlpha = 0.40;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(originX, originY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Thumb fill
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#aaddff';
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Thumb stroke
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Resource-driven visual updates
  // ---------------------------------------------------------------

  _onResourceUpdated(data) {
    // Modulate particle behavior based on resource rates
    if (!this.canvasConfig) return;

    if (data.resourceId === 'energy' && data.ratePerSec != null) {
      const intensity = Math.min(2, 0.5 + data.ratePerSec * 0.05);
      this.particleSystem.setRegionParams('void', {
        motionSpeed: intensity,
        brightness: Math.min(1.5, 0.6 + data.ratePerSec * 0.02),
      });
    }

    if (data.resourceId === 'mass' && this._visualThresholds) {
      const mass = data.currentValue || 0;
      this._currentMass = mass; // Track mass for gravity scaling
      let newLevel = 0;
      for (let i = this._visualThresholds.length - 1; i >= 0; i--) {
        if (mass >= this._visualThresholds[i].minMass) {
          newLevel = i;
          break;
        }
      }
      if (newLevel !== this._thresholdLevel) {
        this._thresholdLevel = newLevel;
        const threshold = this._visualThresholds[newLevel];
        this.bus.emit('visual:threshold:changed', threshold);
      }
    }
  }

  _onUpgradePurchased(data) {
    if (data.upgradeId === 'upg_gravitationalPull') {
      const ho = this.canvasConfig?.homeObject;
      if (!ho) {
        // canvasConfig not loaded yet — defer until loadEpochConfig runs
        this._pendingGravityLevel = Math.max(this._pendingGravityLevel, data.level || 1);
        console.warn('[CanvasRenderer] Gravitational Pull deferred — home object not ready yet');
        return;
      }
      try {
        // Gravity radius scales with upgrade level — much larger with steep falloff
        const gravityRadiusByLevel = [0, 200, 400, 700, 1000, 1400];
        const level = data.level || 1;
        const radius = gravityRadiusByLevel[Math.min(level, gravityRadiusByLevel.length - 1)];

        console.log(`[CanvasRenderer] Gravity level ${level}, radius ${radius} at (${ho.worldX}, ${ho.worldY})`);
        this.particleSystem.enableAttractionAll(ho.worldX, ho.worldY, radius);
        this._gravityBaseRadius = radius;
        this.particleSystem.setAbsorptionCallback((wx, wy, quality) => {
          this._homeObjectPulse = 1;
          const { sx, sy } = this.camera.worldToScreen(wx, wy);
          this.bus.emit('particle:absorbed', { worldX: wx, worldY: wy, screenX: sx, screenY: sy, quality });
        });
        console.log('[CanvasRenderer] Gravity attraction set up successfully');
      } catch (err) {
        console.error('[CanvasRenderer] Error setting up gravity:', err);
      }
    }
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  /** Spawn a floating number at a screen position. */
  spawnFloatingNumber(text, sx, sy, combo = false) {
    this.floatingNumbers.spawn(text, sx, sy, combo);
  }

  /** Toggle glow canvas rendering. */
  setGlowEnabled(enabled) {
    this.glowEnabled = !!enabled;
    if (this.glowCanvas) {
      this.glowCanvas.style.display = this.glowEnabled ? '' : 'none';
    }
  }

  /** Set the energy→mass conversion rate (0..1). Used by the slider UI. */
  setConversionRate(rate) {
    this._conversionRate = Math.max(0, Math.min(1, rate));
  }

  /** Get the current conversion rate (0..1). */
  getConversionRate() {
    return this._conversionRate;
  }

  /**
   * Store a reference to the MoteController so the renderer can read
   * the mote's live position, angle, and tractor beam state each frame.
   */
  setMoteController(mc) {
    this._moteController = mc;
  }

  /**
   * Attach a DarkMatterSystem for node rendering and wave dispatch.
   * @param {import('../engine/DarkMatterSystem.js?v=27e9987').DarkMatterSystem} sys
   */
  setDarkMatterSystem(sys) {
    this._darkMatterSystem = sys;
  }

  /**
   * Apply an outward radial force to particles (called on darkMatter:wave event).
   * @param {number} x  World X
   * @param {number} y  World Y
   * @param {number} radius  Affected radius in world pixels
   * @param {number} strength  Wave force strength
   */
  applyRadialForce(x, y, radius, strength) {
    this.particleSystem?.applyRadialForce(x, y, radius, strength);
  }

  /**
   * Activate the Particle Storm reward effect.
   * Expands gravity radius ×3, spawns a mote burst, and shows a visual indicator.
   * @param {number} durationMs
   */
  activateParticleStorm(durationMs) {
    this._particleStormActive = true;
    this._particleStormTimer = durationMs / 1000;
    this._stormGravityMult = 3;
    this._visualFlash = 1.0;
    // Spawn burst of motes in void region
    if (this.particleSystem) {
      this.particleSystem.spawnInitialParticles('void', 500);
    }
  }

  /** Handle epoch change by loading the new epoch's canvas config. */
  async onEpochChange(epochId) {
    try {
      const module = await import(`../data/${epochId}-canvas.js`);
      const configKey = Object.keys(module).find((k) => k.endsWith('CanvasConfig'));
      if (configKey) {
        this.loadEpochConfig(module[configKey]);
      }
    } catch (err) {
      console.error(`[CanvasRenderer] Failed to load canvas config for ${epochId}:`, err);
    }
  }
}
