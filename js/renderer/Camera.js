/**
 * Camera — Tracks viewport offset in world space.
 * Handles mouse and touch panning with tap/click detection.
 */
export class Camera {
  constructor(EventBus) {
    this.bus = EventBus;
    this.x = 0;
    this.y = 0;
    this.viewW = 0;
    this.viewH = 0;
    this.universeW = 4000;
    this.universeH = 3000;

    // Drag state
    this._isDragging = false;
    this._startX = 0;
    this._startY = 0;
    this._startTime = 0;
    this._lastPointerX = 0;
    this._lastPointerY = 0;

    // Bound handlers for cleanup
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
  }

  /** Attach input listeners to a canvas element (click only, no drag). */
  attach(canvas) {
    this._canvas = canvas;
    // Only attach click detection - no drag navigation
    // (mote movement is now the primary camera control)
    canvas.addEventListener('click', (e) => {
      this.bus.emit('click:primaryObject', {
        x: e.offsetX,
        y: e.offsetY,
      });
    });
  }

  /** Convert world coordinates to screen coordinates. */
  worldToScreen(wx, wy) {
    return { sx: wx - this.x, sy: wy - this.y };
  }

  /** Convert screen coordinates to world coordinates. */
  screenToWorld(sx, sy) {
    return { wx: sx + this.x, wy: sy + this.y };
  }

  /** AABB visibility test with 64px buffer around viewport. */
  isVisible(wx, wy, w, h) {
    const buf = 64;
    return (
      wx + w > this.x - buf &&
      wx < this.x + this.viewW + buf &&
      wy + h > this.y - buf &&
      wy < this.y + this.viewH + buf
    );
  }

  /** No clamping for infinite universe - camera can move freely. */
  clamp() {
    // For a very large universe (1M×1M), no clamping needed.
    // Camera position can be any value without wrapping.
  }

  /** Update viewport dimensions. */
  setViewSize(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  /** Store universe dimensions for clamping. */
  setUniverseSize(w, h) {
    this.universeW = w;
    this.universeH = h;
  }

  // --- Mouse handlers ---

  _handleMouseDown(e) {
    this._isDragging = true;
    this._startX = e.clientX;
    this._startY = e.clientY;
    this._lastPointerX = e.clientX;
    this._lastPointerY = e.clientY;
    this._startTime = performance.now();
  }

  _handleMouseMove(e) {
    if (!this._isDragging) return;
    const dx = e.clientX - this._lastPointerX;
    const dy = e.clientY - this._lastPointerY;
    this.x -= dx;
    this.y -= dy;
    this.clamp();
    this._lastPointerX = e.clientX;
    this._lastPointerY = e.clientY;
  }

  _handleMouseUp(e) {
    if (!this._isDragging) return;
    this._isDragging = false;

    const travel = Math.hypot(
      e.clientX - this._startX,
      e.clientY - this._startY
    );
    const duration = performance.now() - this._startTime;

    if (travel < 5 && duration < 200) {
      this.bus.emit('click:primaryObject', {
        x: e.offsetX,
        y: e.offsetY,
      });
    }
  }

  // --- Touch handlers ---

  _handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this._isDragging = true;
    this._startX = t.clientX;
    this._startY = t.clientY;
    this._lastPointerX = t.clientX;
    this._lastPointerY = t.clientY;
    this._startTime = performance.now();
  }

  _handleTouchMove(e) {
    if (!this._isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - this._lastPointerX;
    const dy = t.clientY - this._lastPointerY;
    this.x -= dx;
    this.y -= dy;
    this.clamp();
    this._lastPointerX = t.clientX;
    this._lastPointerY = t.clientY;
  }

  _handleTouchEnd(e) {
    if (!this._isDragging) return;
    this._isDragging = false;

    const travel = Math.hypot(
      this._lastPointerX - this._startX,
      this._lastPointerY - this._startY
    );
    const duration = performance.now() - this._startTime;

    if (travel < 5 && duration < 200) {
      this.bus.emit('click:primaryObject', {
        x: this._lastPointerX - this._canvas.getBoundingClientRect().left,
        y: this._lastPointerY - this._canvas.getBoundingClientRect().top,
      });
    }
  }
}
