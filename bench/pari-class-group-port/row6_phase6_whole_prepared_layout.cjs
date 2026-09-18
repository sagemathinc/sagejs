"use strict";

// Reviewed storage policy for the row-6 prepared-only experiment.  These are
// ceilings, not observations copied from a factor-base or relation result.
// Logical counts are produced by the native root from the authenticated
// prepared number field and must fit inside these allocations.

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const ROW6_PREPARED_LAYOUT = deepFreeze({
  schema: "sagejs.pari-class-group/row6-prepared-only-layout-v1",
  dimensions: {
    degree: 3,
    places: 3,
    maxFactorIdeals: 2048,
    // `init_rel` uses target = KC + 5 + unit_rank and reserves
    // 10 * target + 50 slots.  For a cubic, unit_rank <= degree - 1.
    maxAdditionalRelations: 7,
    maxRelationColumns: 2055,
    maxRelationCapacity: 20600,
    maxRuntimePrimes: 9196,
    maxPrimeIndex: 65537,
  },
  integerWords: {
    collectorDefault: 16,
    collectorCompact: 2,
    collectorIndex: 2,
    collectorGenerator: 16,
    hnfDefault: 6,
    hnfWide: 16,
    hnfLogs: 8,
    append: 16,
    ancestry: 64,
    ancestryTrailing: 32,
    ancestryAccepted: 16,
  },
  appendCeilings: {
    maxCheckpoints: 2,
    maxNewColumnsPerCheckpoint: 8,
    maxHRows: 16,
  },
  ancestryCeilings: {
    // Cubic Dirichlet rank plus five PARI safety relations, and a Smith
    // presentation no wider than the factor base.  These bound storage only;
    // live kernel/class widths are published by the native computation.
    maxKernelRows: 7,
    maxClassRows: 16,
    maxSelectedRows: 23,
  },
});

function assertLayout() {
  const d = ROW6_PREPARED_LAYOUT.dimensions;
  const a = ROW6_PREPARED_LAYOUT.appendCeilings;
  if (d.degree !== 3 || d.places !== 3)
    throw new Error("invalid row-6 prepared-only dimension policy");
  if (d.maxAdditionalRelations !== 5 + d.degree - 1 ||
      d.maxRelationColumns !== d.maxFactorIdeals + d.maxAdditionalRelations ||
      d.maxRelationCapacity !== 10 * d.maxRelationColumns + 50 ||
      d.maxRuntimePrimes > d.maxPrimeIndex)
    throw new Error("invalid row-6 prepared-only relation policy");
  if (a.maxCheckpoints < 1 || a.maxNewColumnsPerCheckpoint < 1 ||
      a.maxHRows > d.maxFactorIdeals)
    throw new Error("invalid row-6 prepared-only append policy");
  const ancestry = ROW6_PREPARED_LAYOUT.ancestryCeilings;
  if (ancestry.maxClassRows < a.maxHRows ||
      ancestry.maxSelectedRows <
        ancestry.maxClassRows + ancestry.maxKernelRows)
    throw new Error("invalid row-6 prepared-only ancestry policy");
  for (const [name, words] of Object.entries(ROW6_PREPARED_LAYOUT.integerWords)) {
    if (!Number.isSafeInteger(words) || words <= 0)
      throw new Error(`invalid row-6 word ceiling ${name}`);
  }
  return ROW6_PREPARED_LAYOUT;
}

module.exports = { ROW6_PREPARED_LAYOUT, assertLayout };
