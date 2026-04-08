/**
 * MoteController — Manages the player mote's world position, angle, and velocity.
 * Unlocked via the 'upg_cosmicDrift' upgrade, with speed/turn/tractor beam upgrades.
 * Emits 'mote:moved' on the EventBus each tick when enabled.
 */

export class MoteController {
  constructor(EventBus) {
    this.bus = EventBus;
    this.worldX = 600;
    this.worldY = 1500;
    this.angle = -Math.PI / 2; // visual facing angle, derived from velocity
    this.maxSpeed = 0;
    this.tractorBeamRange = 0;
    this.tractorBeamStrength = 1.0;

    // Velocity components for direct 4-axis movement
    this._vx = 0;
    this._vy = 0;

    // Movement input state (WASD = up/down/left/right in world space)
    this._input = { up: false, down: false, left: false, right: false };
    this._enabled = false;

    // Universe bounds (set from canvas config)
    this._boundsW = 4000;
    this._boundsH = 3000;

    // Controls hint timing
    this._hintShowTime = 0;
    this._lastMoveTime = 0;

    // Virtual joystick state (touch/mouse drag)
    this._joystickActive = false;
    this._joystickOriginX = 0;  // canvas-relative screen coords
    this._joystickOriginY = 0;
    this._joystickCurrentX = 0;
    this._joystickCurrentY = 0;
    this._joystickCanvasLeft = 0; // cached canvas offset at gesture start
    this._joystickCanvasTop = 0;
    /** Maximum drag radius in CSS pixels before speed is capped */
    this._joystickMaxRadius = 60;
    this._canvas = null;

    /** True when the primary input is touch (used to tailor the controls hint). */
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Bound handlers
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
  }

  /**
   * Initialise with starting position, attach keyboard listeners, and
   * optionally attach pointer-based drag-to-move on a canvas element.
   * @param {number} initialX
   * @param {number} initialY
   * @param {HTMLCanvasElement} [canvas]
   */
  init(initialX, initialY, canvas) {
    this.worldX = initialX;
    this.worldY = initialY;
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    if (canvas) {
      this._canvas = canvas;
      canvas.addEventListener('pointerdown', this._onPointerDown);
      canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
      canvas.addEventListener('pointerup', this._onPointerUp);
      canvas.addEventListener('pointercancel', this._onPointerUp);
    }

    this.bus.on('upgrade:purchased', (data) => this._onUpgrade(data));
  }

  /**
   * Set universe bounds for clamping (called when canvas config loads).
   */
  setBounds(w, h) {
    this._boundsW = w;
    this._boundsH = h;
  }

  /**
   * Game-frame update — called from onFrame at full rAF rate (~60fps) for smooth motion.
   * @param {number} dt — real wall-clock delta in seconds (clamped externally)
   */
  tick(dt) {
    if (!this._enabled || dt <= 0) return;

    const accel = this.maxSpeed * 8 * dt;   // reach max speed in ~0.125s
    const friction = Math.pow(0.008, dt);    // aggressive stop — nearly instant when released

    if (this._joystickActive) {
      // Virtual joystick drives velocity — speed proportional to drag distance
      const dx = this._joystickCurrentX - this._joystickOriginX;
      const dy = this._joystickCurrentY - this._joystickOriginY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const deadZone = 6; // CSS pixels — ignore micro-movements

      if (dist > deadZone) {
        const norm = Math.min(dist, this._joystickMaxRadius) / this._joystickMaxRadius;
        const nx = (dx / dist) * norm;
        const ny = (dy / dist) * norm;
        const targetVx = nx * this.maxSpeed;
        const targetVy = ny * this.maxSpeed;

        // Accelerate toward joystick target
        if (targetVx < this._vx) this._vx = Math.max(this._vx - accel, targetVx);
        else                      this._vx = Math.min(this._vx + accel, targetVx);
        if (targetVy < this._vy) this._vy = Math.max(this._vy - accel, targetVy);
        else                      this._vy = Math.min(this._vy + accel, targetVy);
      } else {
        this._vx *= friction;
        this._vy *= friction;
      }
    } else {
      // Keyboard input
      if (this._input.left)       this._vx = Math.max(this._vx - accel, -this.maxSpeed);
      else if (this._input.right) this._vx = Math.min(this._vx + accel,  this.maxSpeed);
      else                        this._vx *= friction;

      if (this._input.up)         this._vy = Math.max(this._vy - accel, -this.maxSpeed);
      else if (this._input.down)  this._vy = Math.min(this._vy + accel,  this.maxSpeed);
      else                        this._vy *= friction;
    }

    // Snap tiny velocity to zero to avoid micro-drift
    if (Math.abs(this._vx) < 0.5) this._vx = 0;
    if (Math.abs(this._vy) < 0.5) this._vy = 0;

    this.worldX += this._vx * dt;
    this.worldY += this._vy * dt;

    // Update visual facing angle from current velocity direction
    if (Math.abs(this._vx) > 1 || Math.abs(this._vy) > 1) {
      this.angle = Math.atan2(this._vy, this._vx);
      this._lastMoveTime = performance.now();
    }

    this.bus.emit('mote:moved', {
      worldX: this.worldX,
      worldY: this.worldY,
      angle: this.angle,
      speed: Math.sqrt(this._vx * this._vx + this._vy * this._vy),
    });
  }

  /** Current speed magnitude (for compatibility). */
  get speed() {
    return Math.sqrt(this._vx * this._vx + this._vy * this._vy);
  }

  /** Whether movement is currently enabled. */
  get enabled() {
    return this._enabled;
  }

  /**
   * Returns joystick state for the renderer to draw the virtual joystick overlay.
   * @returns {{ active: boolean, originX: number, originY: number, currentX: number, currentY: number, maxRadius: number }}
   */
  getJoystickState() {
    return {
      active: this._joystickActive,
      originX: this._joystickOriginX,
      originY: this._joystickOriginY,
      currentX: this._joystickCurrentX,
      currentY: this._joystickCurrentY,
      maxRadius: this._joystickMaxRadius,
    };
  }

  // ── Keyboard handlers ───────────────────────────────────────────────

  _handleKeyDown(e) {
    if (!this._enabled) return;
    switch (e.key) {
      case 'w': case 'W': case 'ArrowUp':    this._input.up    = true; break;
      case 's': case 'S': case 'ArrowDown':   this._input.down  = true; break;
      case 'a': case 'A': case 'ArrowLeft':   this._input.left  = true; break;
      case 'd': case 'D': case 'ArrowRight':  this._input.right = true; break;
    }
  }

  _handleKeyUp(e) {
    switch (e.key) {
      case 'w': case 'W': case 'ArrowUp':    this._input.up    = false; break;
      case 's': case 'S': case 'ArrowDown':   this._input.down  = false; break;
      case 'a': case 'A': case 'ArrowLeft':   this._input.left  = false; break;
      case 'd': case 'D': case 'ArrowRight':  this._input.right = false; break;
    }
  }

  // ── Virtual joystick pointer handlers ───────────────────────────────

  _handlePointerDown(e) {
    if (!this._enabled || !e.isPrimary) return;
    // Cache canvas offset so we don't call getBoundingClientRect() every frame
    const rect = this._canvas.getBoundingClientRect();
    this._joystickCanvasLeft = rect.left;
    this._joystickCanvasTop = rect.top;
    const cx = e.clientX - this._joystickCanvasLeft;
    const cy = e.clientY - this._joystickCanvasTop;
    this._joystickOriginX = cx;
    this._joystickOriginY = cy;
    this._joystickCurrentX = cx;
    this._joystickCurrentY = cy;
    this._joystickActive = true;
    try { this._canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  _handlePointerMove(e) {
    if (!this._joystickActive || !e.isPrimary) return;
    e.preventDefault(); // prevent scroll on touch
    this._joystickCurrentX = e.clientX - this._joystickCanvasLeft;
    this._joystickCurrentY = e.clientY - this._joystickCanvasTop;
    this._lastMoveTime = performance.now();
  }

  _handlePointerUp(e) {
    if (!e.isPrimary) return;
    this._joystickActive = false;
  }

  // ── Upgrade handler ─────────────────────────────────────────────────

  _onUpgrade(data) {
    switch (data.upgradeId) {
      case 'upg_cosmicDrift':
        this._enabled = true;
        this.maxSpeed = 80;
        // Show controls hint for 10 seconds
        this._hintShowTime = performance.now() + 10_000;
        this._lastMoveTime = performance.now();
        break;
      case 'upg_ionThrust':
        this.maxSpeed = 80 + (data.level || 1) * 30;
        break;
      case 'upg_maneuveringJets':
        // No-op for direct movement model — kept for save compatibility
        break;
      case 'upg_eventHorizon':
        this.tractorBeamRange = 120 + (data.level || 1) * 60;
        this.tractorBeamStrength = 1.0 + (data.level || 1) * 0.5;
        break;
    }
  }

  /**
   * Returns whether the controls hint should be visible, and its alpha (0..1).
   */
  getHintState() {
    if (!this._enabled) return { visible: false, alpha: 0 };
    const now = performance.now();

    // Show for 10s after unlock
    if (now < this._hintShowTime) {
      const remaining = this._hintShowTime - now;
      const alpha = remaining < 2000 ? remaining / 2000 : 1;
      return { visible: true, alpha };
    }

    // Reappear if idle for 30+ seconds
    const idle = now - this._lastMoveTime;
    if (idle > 30_000) {
      const fadeIn = Math.min(1, (idle - 30_000) / 1000);
      return { visible: true, alpha: fadeIn * 0.7 };
    }

    return { visible: false, alpha: 0 };
  }

  // ── Serialisation ───────────────────────────────────────────────────

  getState() {
    return {
      worldX: this.worldX,
      worldY: this.worldY,
      angle: this.angle,
      vx: this._vx,
      vy: this._vy,
      enabled: this._enabled,
      maxSpeed: this.maxSpeed,
      tractorBeamRange: this.tractorBeamRange,
      tractorBeamStrength: this.tractorBeamStrength,
    };
  }

  loadState(state) {
    if (!state) return;
    this.worldX = state.worldX ?? this.worldX;
    this.worldY = state.worldY ?? this.worldY;
    this.angle = state.angle ?? this.angle;
    this._vx = state.vx ?? 0;
    this._vy = state.vy ?? 0;
    this._enabled = state.enabled ?? false;
    this.maxSpeed = state.maxSpeed ?? 0;
    this.tractorBeamRange = state.tractorBeamRange ?? 0;
    this.tractorBeamStrength = state.tractorBeamStrength ?? 1.0;
    if (this._enabled) {
      this._lastMoveTime = performance.now();
    }
  }
}
