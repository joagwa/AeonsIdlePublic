/**
 * FloatingNumbers — Pool of floating +N text animations.
 */
export class FloatingNumbers {
  constructor() {
    /** @type {{ text: string, x: number, y: number, alpha: number, vy: number, lifetime: number, age: number, combo: boolean }[]} */
    this.numbers = [];
  }

  /**
   * Spawn a floating number.
   * @param {string} text - display text (e.g. "+5")
   * @param {number} sx - screen X
   * @param {number} sy - screen Y
   * @param {boolean} [combo=false] - gold color for combo hits
   */
  spawn(text, sx, sy, combo = false) {
    this.numbers.push({
      text,
      x: sx,
      y: sy,
      alpha: 1,
      vy: -60,
      lifetime: 0.8,
      age: 0,
      combo,
    });
  }

  /** Advance animations and cull expired entries. */
  update(dt) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.y += n.vy * dt;
      n.age += dt;
      n.alpha = 1 - n.age / n.lifetime;
      if (n.age >= n.lifetime) {
        this.numbers.splice(i, 1);
      }
    }
  }

  /** Draw all live floating numbers. */
  draw(ctx) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';

    for (const n of this.numbers) {
      const color = n.combo ? `rgba(255,200,50,${n.alpha})` : `rgba(255,255,255,${n.alpha})`;
      ctx.fillStyle = color;
      ctx.fillText(n.text, Math.round(n.x), Math.round(n.y));
    }

    ctx.textAlign = 'start';
  }
}
