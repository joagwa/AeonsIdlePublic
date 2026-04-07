/**
 * Minimap — Draws the full universe at ~10% scale in the bottom-right corner.
 */

const MINIMAP_W = 160;
const MINIMAP_H = 120;
const MINIMAP_PADDING = 12;

export class Minimap {
  constructor(EventBus) {
    this.bus = EventBus;
    this.universeW = 4000;
    this.universeH = 3000;
    this.regions = [];
  }

  /** Store universe dimensions and region definitions. */
  loadConfig(canvasConfig) {
    this.universeW = canvasConfig.universeWidth || 4000;
    this.universeH = canvasConfig.universeHeight || 3000;
    this.regions = canvasConfig.regions || [];
  }

  /**
   * Draw the minimap overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Camera} camera
   * @param {number} viewW - viewport width
   * @param {number} viewH - viewport height
   * @param {object[]} regionStates - from RegionManager.getRegions()
   */
  draw(ctx, camera, viewW, viewH, regionStates) {
    const mx = viewW - MINIMAP_W - MINIMAP_PADDING;
    const my = viewH - MINIMAP_H - MINIMAP_PADDING;
    const scaleX = MINIMAP_W / this.universeW;
    const scaleY = MINIMAP_H / this.universeH;

    // Background
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);

    // Border
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, MINIMAP_W, MINIMAP_H);

    // Region rects
    const stateMap = new Map();
    if (regionStates) {
      for (const rs of regionStates) {
        stateMap.set(rs.regionId, rs);
      }
    }

    for (const region of this.regions) {
      const b = region.worldBounds;
      const rs = stateMap.get(region.regionId);
      const rx = mx + b.x * scaleX;
      const ry = my + b.y * scaleY;
      const rw = b.w * scaleX;
      const rh = b.h * scaleY;

      if (!rs || rs.state === 'DARK') {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#111';
      } else if (rs.state === 'FADING_IN') {
        ctx.globalAlpha = 0.2 + rs.activationLevel * 0.3;
        ctx.fillStyle = region.accentColor;
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = region.accentColor;
      }

      ctx.fillRect(rx, ry, rw, rh);
    }

    // Camera viewport indicator
    const vx = mx + camera.x * scaleX;
    const vy = my + camera.y * scaleY;
    const vw = camera.viewW * scaleX;
    const vh = camera.viewH * scaleY;

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.globalAlpha = 1;
  }
}
