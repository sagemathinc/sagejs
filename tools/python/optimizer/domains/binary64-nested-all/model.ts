/** Stable identities owned by nested binary64 `all` reconnaissance. */
export const BINARY64_NESTED_ALL_RECONNAISSANCE_PASS =
  "math.binary64-nested-all-reconnaissance.v1";
export const BINARY64_NESTED_ALL_RECONNAISSANCE_DOMAIN =
  "binary64-nested-all-reconnaissance";
export const BINARY64_NESTED_ALL_RECONNAISSANCE_VERIFIER =
  "verify.binary64-nested-all-reconnaissance.v1";
export const BINARY64_NESTED_ALL_RECONNAISSANCE_PRIORITY = 145;

export const BINARY64_NESTED_ALL_REASONS = Object.freeze({
  builtinAllIdentity:
    "binary64-nested-all.builtin-all-identity-unproved",
  fixedPairRepresentation:
    "binary64-nested-all.strict-binary64-fixed-pair-representation-unproved",
  indexedPairShape:
    "binary64-nested-all.indexed-pair-shape-unproved",
  innerExactListIteration:
    "binary64-nested-all.inner-exact-list-iteration-unproved",
  interruptSemantics:
    "binary64-nested-all.interrupt-semantics-unproved",
  mathIsfiniteIdentity:
    "binary64-nested-all.math-isfinite-identity-unproved",
  nativeBoundary:
    "binary64-nested-all.native-boundary-unevaluated",
  outerExactListIteration:
    "binary64-nested-all.outer-exact-list-iteration-unproved",
  restartFallback:
    "binary64-nested-all.untouched-restart-fallback-unproved",
  scalarRepresentation:
    "binary64-nested-all.strict-binary64-scalar-representation-unproved",
  shortCircuitOrder:
    "binary64-nested-all.short-circuit-order-unproved",
  v8Lowering:
    "binary64-nested-all.v8-lowering-unimplemented",
  wasmBoundary:
    "binary64-nested-all.wasm-boundary-unevaluated",
} as const);

export type Binary64NestedAllPredicateKind =
  | "scalar-isfinite"
  | "fixed-pair-isfinite";

export interface Binary64NestedAllProgram {
  version: 1;
  kind: "nested-binary64-all";
  traversalKind: "two-clause-generator-under-builtin-all";
  predicateKind: Binary64NestedAllPredicateKind;
  outerSequenceName: string;
  outerElementName: string;
  innerElementName: string;
  pairIndices: readonly [] | readonly [0, 1];
  operations: readonly string[];
  proofGaps: readonly string[];
}

export type Binary64NestedAllRecognition =
  | { recognized: true; program: Binary64NestedAllProgram }
  | { recognized: false; reason: string };

const COMMON_PROOF_GAPS = Object.freeze([
  BINARY64_NESTED_ALL_REASONS.builtinAllIdentity,
  BINARY64_NESTED_ALL_REASONS.innerExactListIteration,
  BINARY64_NESTED_ALL_REASONS.interruptSemantics,
  BINARY64_NESTED_ALL_REASONS.mathIsfiniteIdentity,
  BINARY64_NESTED_ALL_REASONS.outerExactListIteration,
  BINARY64_NESTED_ALL_REASONS.restartFallback,
  BINARY64_NESTED_ALL_REASONS.shortCircuitOrder,
].sort());

export function binary64NestedAllProofGaps(
  predicateKind: Binary64NestedAllPredicateKind,
): readonly string[] {
  return Object.freeze([
    ...COMMON_PROOF_GAPS,
    predicateKind === "scalar-isfinite"
      ? BINARY64_NESTED_ALL_REASONS.scalarRepresentation
      : BINARY64_NESTED_ALL_REASONS.fixedPairRepresentation,
    ...(predicateKind === "fixed-pair-isfinite"
      ? [BINARY64_NESTED_ALL_REASONS.indexedPairShape]
      : []),
  ].sort());
}
