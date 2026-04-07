/**
 * SpriteManager — Stores and retrieves sprite visual definitions for the current epoch.
 */
export class SpriteManager {
  constructor() {
    this.sprites = {};
  }

  /** Load sprite definitions from an epoch canvas config. */
  loadEpochSprites(config) {
    this.sprites = config.spriteDefinitions || {};
  }

  /** Get a sprite definition by particle type, falling back to 'mote'. */
  getSprite(type) {
    return this.sprites[type] || this.sprites.mote;
  }
}
