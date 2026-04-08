// epoch1-canvas.js — Canvas layout and visual configuration for Epoch 1 ("Cosmic Dawn").
//
// Defines the scrollable universe dimensions, the five progression regions
// arranged left-to-right as horizontal bands, sprite visual parameters, and
// the player's home object that anchors the initial camera position.

export const epoch1CanvasConfig = {
  // --- Universe dimensions (virtual world pixels) ---
  // 1M × 1M with wrapping (edges loop around)
  universeWidth: 1000000,
  universeHeight: 1000000,

  // --- Region definitions (left → right progression) ---
  regions: [
    {
      regionId: 'void',
      name: 'The Void',
      worldBounds: { x: 0, y: 0, w: 4000, h: 5000 },
      activationMilestone: null, // always active
      regionBand: 1,
      baseColor: '#050510',
      accentColor: '#a0c4ff',
      particleTypes: ['mote', 'shimmer'],
      maxParticles: 500,
      initiallyActive: true,
    },
    {
      regionId: 'atomicNursery',
      name: 'The Atomic Nursery',
      worldBounds: { x: 4000, y: 0, w: 2500, h: 5000 },
      activationMilestone: 'ms_firstAtom',
      regionBand: 2,
      baseColor: '#08081a',
      accentColor: '#b0d4ff',
      particleTypes: ['mote', 'shimmer', 'drift'],
      maxParticles: 500,
      initiallyActive: false,
    },
    {
      regionId: 'nebula',
      name: 'The Nebula',
      worldBounds: { x: 6500, y: 0, w: 2000, h: 5000 },
      activationMilestone: 'ms_nebulaCondenses',
      regionBand: 3,
      baseColor: '#100820',
      accentColor: '#c090ff',
      particleTypes: ['drift', 'shimmer'],
      maxParticles: 500,
      initiallyActive: false,
    },
    {
      regionId: 'stellarForge',
      name: 'The Stellar Forge',
      worldBounds: { x: 8500, y: 0, w: 2500, h: 5000 },
      activationMilestone: 'ms_mainSequenceStar',
      regionBand: 4,
      baseColor: '#181020',
      accentColor: '#ffa040',
      particleTypes: ['starPixel', 'shimmer', 'mote'],
      maxParticles: 500,
      initiallyActive: false,
    },
    {
      regionId: 'planetaryCradle',
      name: 'The Planetary Cradle',
      worldBounds: { x: 11000, y: 0, w: 2500, h: 5000 },
      activationMilestone: 'ms_planetaryDisc',
      regionBand: 5,
      baseColor: '#101018',
      accentColor: '#80c0a0',
      particleTypes: ['planetOrb', 'drift', 'mote'],
      maxParticles: 500,
      initiallyActive: false,
    },
  ],

  // --- Sprite visual definitions keyed by particle type ---
  spriteDefinitions: {
    mote:    { minSize: 1, maxSize: 3, baseColor: '#5878c0', glowRadius: 0, flickerRate: 0.12 },
    shimmer: { minSize: 1, maxSize: 2, baseColor: '#90a8d8', glowRadius: 0, flickerRate: 0.5 },
    drift:   { minSize: 2, maxSize: 3, baseColor: '#6888c0', glowRadius: 0, flickerRate: 0.05 },
    starPixel: { minSize: 2, maxSize: 6, baseColor: '#ffffff', glowRadius: 2, flickerRate: 0.1 },
    planetOrb: { minSize: 4, maxSize: 8, baseColor: '#60a080', glowRadius: 1, flickerRate: 0 },
    
    // Mote quality tiers (for procedural generation)
    mote_base:      { minSize: 1, maxSize: 3, baseColor: '#5878c0', glowRadius: 0, flickerRate: 0.12 },  // blue
    mote_common:    { minSize: 1, maxSize: 3, baseColor: '#00d4ff', glowRadius: 0.5, flickerRate: 0.15 }, // cyan
    mote_rare:      { minSize: 1, maxSize: 3, baseColor: '#c850ff', glowRadius: 1, flickerRate: 0.2 },   // purple
    mote_epic:      { minSize: 2, maxSize: 4, baseColor: '#ffd700', glowRadius: 1.5, flickerRate: 0.25 }, // gold
    mote_legendary: { minSize: 2, maxSize: 4, baseColor: '#ffffff', glowRadius: 2, flickerRate: 0.3 },   // white

    // Dark matter motes — appear as darker-than-void specks once dark matter unlocks
    darkMote: { minSize: 1, maxSize: 3, baseColor: '#1a0830', glowRadius: 0, flickerRate: 0.06 },
  },

  // --- Home object: the player's anchor point in The Void ---
  homeObject: {
    regionId: 'void',
    worldX: 2000,
    worldY: 2500,
    hitRadius: 44,
    baseSize: 4,
    baseColor: '#c8e0ff',
    glowRadius: 3,
  },
};

// Visual thresholds — home object changes appearance as mass grows.
// CanvasRenderer subscribes to resource:updated for mass and checks these.
export const visualThresholds = [
  { minMass: 0,       size: 4,  color: '#c8e0ff', glowRadius: 3,  particleBoost: 300, label: 'Quantum Mote' },
  { minMass: 50,      size: 5,  color: '#d0e8ff', glowRadius: 5,  particleBoost: 380, label: 'Energy Cluster' },
  { minMass: 500,     size: 7,  color: '#90b8ff', glowRadius: 8,  particleBoost: 460, label: 'Proto-Cloud' },
  { minMass: 5000,    size: 10, color: '#ffe080', glowRadius: 12, particleBoost: 550, label: 'Gas Cloud' },
  { minMass: 50000,   size: 14, color: '#ffb030', glowRadius: 18, particleBoost: 700, label: 'Protostar' },
  { minMass: 500000,  size: 18, color: '#ff6820', glowRadius: 26, particleBoost: 900, label: 'Young Star' },
];

