/**
 * MassFormatter — Physical mass computation and SI unit formatting.
 */

// Atomic weights in amu (g/mol ÷ Avogadro ≈ amu per atom)
const ATOMIC_WEIGHTS_AMU = {
  hydrogen: 1.008,
  helium:   4.003,
  carbon:  12.011,
  oxygen:  15.999,
  iron:    55.845,
};

const AMU_TO_GRAMS = 1.66054e-24;

/** Compute physical mass in grams from current element resource amounts. */
export function getPhysicalMassGrams(resourceManager) {
  let totalAmu = 0;
  for (const [id, amu] of Object.entries(ATOMIC_WEIGHTS_AMU)) {
    const state = resourceManager.get(id);
    if (state && state.currentValue > 0) {
      totalAmu += state.currentValue * amu;
    }
  }
  return totalAmu * AMU_TO_GRAMS;
}

const SI_SCALE = [
  { threshold: 1e-15, unit: 'ag',  factor: 1e-18 },
  { threshold: 1e-12, unit: 'fg',  factor: 1e-15 },
  { threshold: 1e-9,  unit: 'pg',  factor: 1e-12 },
  { threshold: 1e-6,  unit: 'ng',  factor: 1e-9  },
  { threshold: 1e-3,  unit: 'μg',  factor: 1e-6  },
  { threshold: 1,     unit: 'mg',  factor: 1e-3  },
  { threshold: 1e3,   unit: 'g',   factor: 1     },
  { threshold: 1e6,   unit: 'kg',  factor: 1e3   },
  { threshold: 1e9,   unit: 't',   factor: 1e6   },
  { threshold: 1e12,  unit: 'kt',  factor: 1e9   },
  { threshold: Infinity, unit: 'Mt', factor: 1e12 },
];

/** Format a gram value with appropriate SI prefix. */
export function formatPhysicalMass(grams) {
  if (!grams || grams <= 0) return '0 ag';
  for (const { threshold, unit, factor } of SI_SCALE) {
    if (grams < threshold) {
      const val = grams / factor;
      const formatted = val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.round(val).toString();
      return `${formatted} ${unit}`;
    }
  }
  return `${(grams / 1e12).toFixed(2)} Mt`;
}
