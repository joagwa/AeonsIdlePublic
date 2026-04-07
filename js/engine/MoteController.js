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
    this.angle = -Math.PI / 2; // face upward initially
    this.speed = 0;
    this.maxSpeed = 0;
    this.turnSpeed = 0;
    this.tractorBeamRange = 0;
    this.tractorBeamStrength = 1.0;

    // Movement input state
    this._input = { forward: false, backward: false, left: false, right: false };
    this._enabled = false;

    // Universe bounds (set from canvas config)
    this._boundsW = 4000;
    this._boundsH = 3000;

    // Controls hint timing
    this._hintShowTime = 0;      // when to stop showing hint (performance.now)
    this._lastMoveTime = 0;      // last time player moved
    this._hintFadeStart = 0;     // when fade-out began

    // Bound handlers
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
  }

  /**
   * Initialise with starting position and attach keyboard listeners.
   */
  init(initialX, initialY) {
    this.worldX = initialX;
    this.worldY = initialY;
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

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
   * Game-tick update (called at 20 Hz from GameLoop).
   */
  tick(dt) {
    if (!this._enabled) return;

    // Turn
    if (this._input.left) this.angle -= this.turnSpeed * dt;
    if (this._input.right) this.angle += this.turnSpeed * dt;

    // Accelerate / decelerate
    if (this._input.forward) {
      this.speed = Math.min(this.speed + this.maxSpeed * 2 * dt, this.maxSpeed);
    } else if (this._input.backward) {
      this.speed = Math.max(this.speed - this.maxSpeed * 3 * dt, -this.maxSpeed * 0.3);
    } else {
      // Friction
      this.speed *= Math.pow(0.3, dt);
      if (Math.abs(this.speed) < 0.5) this.speed = 0;
    }

    // Move
    this.worldX += Math.cos(this.angle) * this.speed * dt;
    this.worldY += Math.sin(this.angle) * this.speed * dt;

    // No bounds clamping needed for very large universe (1M×1M)
    // Player can move freely in any direction

    // Track movement for hint display
    if (this.speed !== 0) {
      this._lastMoveTime = performance.now();
    }

    this.bus.emit('mote:moved', {
      worldX: this.worldX,
      worldY: this.worldY,
      angle: this.angle,
      speed: this.speed,
    });
  }

  /** Whether movement is currently enabled. */
  get enabled() {
    return this._enabled;
  }

  // ── Keyboard handlers ───────────────────────────────────────────────

  _handleKeyDown(e) {
    if (!this._enabled) return;
    switch (e.key) {
      case 'w': case 'W': case 'ArrowUp':    this._input.forward = true; break;
      case 's': case 'S': case 'ArrowDown':   this._input.backward = true; break;
      case 'a': case 'A': case 'ArrowLeft':   this._input.left = true; break;
      case 'd': case 'D': case 'ArrowRight':  this._input.right = true; break;
    }
  }

  _handleKeyUp(e) {
    switch (e.key) {
      case 'w': case 'W': case 'ArrowUp':    this._input.forward = false; break;
      case 's': case 'S': case 'ArrowDown':   this._input.backward = false; break;
      case 'a': case 'A': case 'ArrowLeft':   this._input.left = false; break;
      case 'd': case 'D': case 'ArrowRight':  this._input.right = false; break;
    }
  }

  // ── Upgrade handler ─────────────────────────────────────────────────

  _onUpgrade(data) {
    switch (data.upgradeId) {
      case 'upg_cosmicDrift':
        this._enabled = true;
        this.maxSpeed = 40;
        this.turnSpeed = 1.5;
        // Show controls hint for 10 seconds
        this._hintShowTime = performance.now() + 10_000;
        this._lastMoveTime = performance.now();
        break;
      case 'upg_ionThrust':
        this.maxSpeed = 40 + (data.level || 1) * 20;
        break;
      case 'upg_maneuveringJets':
        this.turnSpeed = 1.5 + (data.level || 1) * 0.8;
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
      enabled: this._enabled,
      maxSpeed: this.maxSpeed,
      turnSpeed: this.turnSpeed,
      tractorBeamRange: this.tractorBeamRange,
      tractorBeamStrength: this.tractorBeamStrength,
    };
  }

  loadState(state) {
    if (!state) return;
    this.worldX = state.worldX ?? this.worldX;
    this.worldY = state.worldY ?? this.worldY;
    this.angle = state.angle ?? this.angle;
    this._enabled = state.enabled ?? false;
    this.maxSpeed = state.maxSpeed ?? 0;
    this.turnSpeed = state.turnSpeed ?? 0;
    this.tractorBeamRange = state.tractorBeamRange ?? 0;
    this.tractorBeamStrength = state.tractorBeamStrength ?? 1.0;
    if (this._enabled) {
      this._lastMoveTime = performance.now();
    }
  }
}
