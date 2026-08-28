import { recognizeClosedScalarProgram } from "../canonicalize/scalar-loop";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  FIXED_EXTENSION_DOMAIN,
  FIXED_EXTENSION_LOWERING,
  FIXED_EXTENSION_REGION_PASS,
  FIXED_EXTENSION_VERIFIER,
} from "../domains/fixed-extension";
import { stableRegionIdentity } from "../identity";
import { planFixedExtensionRepresentation } from
  "../representations/fixed-extension";
import {
  FIXED_EXTENSION_TOTAL_CODE_BUDGET_BYTES,
  FIXED_EXTENSION_VARIANT_COMPILE_BUDGET_UNITS,
  planV8FixedExtensionTarget,
} from "../targets/v8-fixed-extension";
import { planV8ScalarCost } from "../targets/v8-scalar-cost";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";

export { FIXED_EXTENSION_DOMAIN };

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function explicitFixedExtensionOwner(
  compiler: any,
  ancestors: readonly any[],
): any | undefined {
  const owner = nearestOwningFunction(compiler, ancestors);
  return owner?.optimization_contract?.requiredPassId ===
      FIXED_EXTENSION_REGION_PASS
    ? owner
    : undefined;
}

export const fixedExtensionRegionPass: OptimizationPass = {
  id: FIXED_EXTENSION_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "explicit-function-optimization-contract", "builtin-range",
    "lexical-binding", "structured-effects",
  ],
  factsProduced: [
    "parent-identity", "parent-stable", "method-stability",
    "immutable-construction-context", "construction-time-modulus-identity",
    "fixed-extension-degree", "fixed-monic-modulus-shape", "no-alias",
    "no-escape", "no-callback", "operation-closed", "exact-range",
    "commutative-ring", "referentially-transparent-used-operations",
    "inplace-fallback", "loop-invariant", "dead-store-free",
    "canonical-integer-coercion", "isolated-degree-target",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "exceptions", "object-identity-on-zero-trip", "generic-fallback",
    "o0-semantics",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "same-parent", "fixed-extension-parent",
    "reviewed-extension-representation", "immutable-construction-context",
    "construction-time-modulus-identity", "degree-and-modulus-shape",
    "prototype-and-used-method-identities", "canonical-coordinates",
    "absent-inplace-methods", "sequence-prefix-bounds",
    "exact-degree-intermediate-bound", "canonical-integer-coercion",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: FIXED_EXTENSION_VERIFIER,
  compilationCostBudget: FIXED_EXTENSION_VARIANT_COMPILE_BUDGET_UNITS,
  codeSizeBudget: FIXED_EXTENSION_TOTAL_CODE_BUDGET_BYTES,
  requiredEvidence: [
    "o0-enabled-disabled-exact-differential",
    "independent-polynomial-reduction-oracle",
    "degree-and-modulus-shape-matrix", "mutation-and-alias-adversarial",
    "power-branch-and-zero-trip-differential",
    "compile-cold-and-warm-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const ownerFunction = explicitFixedExtensionOwner(
        context.compiler,
        ancestors,
      );
      if (!ownerFunction) return;
      const canonical = recognizeClosedScalarProgram(context.compiler, node);
      if (!canonical) return;
      const scalar = planV8ScalarCost(canonical);
      const representation = planFixedExtensionRepresentation();
      const target = planV8FixedExtensionTarget(scalar, representation);
      if (!target) return;
      const fixedExtension = Object.freeze({ representation, target });
      const operands = { ...scalar, fixedExtension };
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(FIXED_EXTENSION_REGION_PASS, source, {
        kind: "fixed-extension-region",
        iteratorKind: operands.iteratorKind,
        iterationOrder: operands.iterationOrder,
        zipStrict: operands.zipStrict,
        zipSequences: operands.iteratorKind === "zip"
          ? operands.zipIterables.map((item: any) => item.name)
          : [],
        zipTargets: operands.iteratorKind === "zip"
          ? operands.zipTargets.map((item: any) => item.name)
          : [],
        zipSequenceBindings: operands.zipSequenceBindings,
        slots: operands.slots.map((slot: any) => slot.name),
        sequences: operands.sequences.map((sequence: any) => sequence.name),
        inputSlots: operands.inputSlots,
        stateSlots: operands.stateSlots,
        localSlots: operands.localSlots,
        semanticStatements: operands.semanticStatements,
        hoistedExpressions: operands.hoistedExpressions,
        statements: operands.statements,
        eliminatedAssignments: operands.eliminatedAssignments,
        operations: operands.operations,
        inplaceOperations: operands.inplaceOperations,
        affine: operands.affine,
        sequenceUses: operands.sequenceUses,
        sequenceAccesses: operands.sequenceAccesses,
        loweredSequenceUses: operands.loweredSequenceUses,
        loweredSequenceAccesses: operands.loweredSequenceAccesses,
        sequenceStrategy: operands.sequenceStrategy,
        integerConstants: operands.integerConstants,
        operationCost: operands.operationCost,
        preheaderOperationCost: operands.preheaderOperationCost,
        targetCodeBytes: operands.targetCodeBytes,
        fixedExtension,
      });
      const adaptive = operands.affine?.kind === "fixed-increment";
      const id = identity.id;
      context.consider({
        minimumLevel: "O2",
        staticRejectionReasons: ancestors.some((ancestor) =>
          ancestor instanceof context.compiler.AST_Try && ancestor.bcatch
        ) ? ["catchable-interrupt-region"] : [],
        node,
        ownerFunction,
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: FIXED_EXTENSION_REGION_PASS,
          loweringId: FIXED_EXTENSION_LOWERING,
          functionId: null,
          guardFailure: "fallback",
          kind: "fixed-extension-region",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: FIXED_EXTENSION_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.fixed-extension-loop",
            operations: [
              "iterate", "sequential-assign",
              ...operands.operations.map(
                (operation: string) => `${operation}-dispatch`,
              ),
              ...operands.inplaceOperations.map(
                (operation: string) => `inplace-${operation}-fallback-dispatch`,
              ),
            ],
            observableExits: [
              ...operands.stateSlots.map(
                (slot: number) => operands.slots[slot].name,
              ),
              "loop-target",
            ],
            exceptionPolicy:
              "all extension/shape/exactness guards precede optimized effects; exact loop fallback",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.fixed-extension-program",
            domain:
              "one guarded fixed finite-field extension of reviewed degree and monic modulus shape",
            operations: operands.operations.map(
              (operation: string) => `math.ring.${operation}`,
            ),
            exactness:
              "degree-specific convolution maxima independently verified below Number.MAX_SAFE_INTEGER",
          },
          facts: [
            { kind: "no-alias", authority: "static", evidence: "distinct lexical state bindings and transactional publication" },
            { kind: "no-escape", authority: "static", evidence: "primitive coordinates remain private until successful region exit" },
            { kind: "no-callback", authority: "runtime-guard", evidence: "used extension operation identities match reviewed immutable implementations" },
            { kind: "referentially-transparent-used-operations", authority: "runtime-guard", evidence: "canonical parent, element brand, prototype, and used method identities are authenticated" },
            ...(operands.inplaceOperations.length ? [{ kind: "inplace-fallback", authority: "runtime-guard" as const, evidence: "all relevant prototype chains lack the corresponding Python in-place descriptor" }] : []),
            { kind: "parent-identity", authority: "runtime-guard", evidence: "every live-in and sequence element has the same extension parent" },
            { kind: "immutable-construction-context", authority: "runtime-guard", evidence: "the parent owns a frozen construction context through a nonwritable, nonconfigurable data property" },
            { kind: "construction-time-modulus-identity", authority: "runtime-guard", evidence: "current source and machine modulus objects are identical to the frozen objects captured when the field was constructed" },
            { kind: "fixed-extension-degree", authority: "runtime-guard", evidence: "degree is one reviewed value in the immutable variant table" },
            { kind: "fixed-monic-modulus-shape", authority: "runtime-guard", evidence: "the authenticated construction-time ascending modulus tuple has exactly one coefficient per basis coordinate" },
            { kind: "exact-range", authority: "contract", evidence: "each variant proves degree * (prime - 1)^2 <= Number.MAX_SAFE_INTEGER" },
            { kind: "commutative-ring", authority: "runtime-guard", evidence: "the extension parent advertises reviewed commutative multiplication" },
            { kind: "isolated-degree-target", authority: "contract", evidence: "each degree has one separately budgeted outlined V8 body" },
            ...(operands.eliminatedAssignments ? [{ kind: "dead-store-free", authority: "static" as const, evidence: "backward liveness proves overwritten pure assignments unobservable" }] : []),
            ...(operands.hoistedExpressions.length ? [{ kind: "loop-invariant", authority: "static" as const, evidence: "hoisted subgraphs depend only on unmodified live-ins" }] : []),
            ...(operands.integerConstants.length ? [{ kind: "canonical-integer-coercion", authority: "runtime-guard" as const, evidence: "the live ZZ-to-parent coercion graph matches the canonical embedding" }] : []),
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-fixed-extension-tuples",
            candidates: [
              ...representation.variants.map((variant) => variant.id),
              "boxed-sage-value",
            ],
            conversions: [
              operands.sequenceStrategy === "stream"
                ? "unbox live-ins and validate extension elements while streaming"
                : "unbox live-ins and immutable extension-element sequence prefixes",
              "load one degree-sized monic modulus tuple into the selected outline",
              "materialize modified live-outs only after transactional success",
            ],
            materializations: operands.stateSlots.length,
          },
          target: {
            level: "target",
            revision: 1,
            kind: adaptive ? "adaptive" : "v8",
            lowering:
              "entry-guarded selection of one separately outlined degree-specific scalar target",
            boundaryCrossings: adaptive ? "runtime-dependent" : 0,
            copiedBytes: "runtime-dependent",
            selectedCandidate: adaptive
              ? "runtime-adaptive"
              : "v8-fixed-extension-outlines",
            policy: adaptive
              ? "authenticated isolated affine target above threshold, otherwise one monomorphic V8 outline"
              : "one monomorphic V8 outline selected before any optimized effect",
            candidates: [
              targetCandidate({
                id: "v8-fixed-extension-outlines",
                kind: "v8",
                representation: "degree-specific extension-tuple-number",
                availability: adaptive ? "runtime-gated" : "selected",
                cost: {
                  boundaryCrossings: 0,
                  emittedBytes: target.totalEmittedBytes,
                  materializations: operands.stateSlots.length,
                },
                evidence: "each reviewed degree has an independently budgeted scalar compilation unit",
              }),
              targetCandidate({
                id: "wasm-fixed-extension-affine",
                kind: "wasm",
                representation: "packed fixed-width coordinates",
                availability: adaptive ? "runtime-gated" : "rejected",
                rejectionReason: adaptive
                  ? null
                  : "general-fixed-extension-wasm-lowering-unimplemented",
                cost: {
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: adaptive
                  ? "authenticated source-transparent affine kernel"
                  : "no operation-graph substitution is permitted",
              }),
              targetCandidate({
                id: "native-fixed-extension-affine",
                kind: "native",
                representation: "packed fixed-width coordinates",
                availability: adaptive ? "runtime-gated" : "rejected",
                rejectionReason: adaptive
                  ? null
                  : "general-fixed-extension-native-lowering-unimplemented",
                cost: {
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: adaptive
                  ? "authenticated source-transparent affine kernel"
                  : "no operation-graph substitution is permitted",
              }),
              targetCandidate({
                id: "generic-fixed-extension-fallback",
                kind: "generic",
                representation: "boxed-sage-value",
                availability: "available",
                cost: {
                  representationConversions: 0,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  materializations: 0,
                  emittedBytes: 0,
                },
                evidence: "untouched source loop retained for O0 and every failed guard",
              }),
            ],
          },
          guards: [
            "safe-iteration-count", "same-parent", "fixed-extension-parent",
            "reviewed-extension-representation", "immutable-construction-context",
            "construction-time-modulus-identity", "degree-and-modulus-shape",
            "prototype-and-used-method-identities", "canonical-coordinates",
            "absent-inplace-methods", "sequence-prefix-bounds",
            "zip-length-contract", "exact-degree-intermediate-bound",
            ...(operands.integerConstants.length
              ? ["canonical-integer-coercion"]
              : []),
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${FIXED_EXTENSION_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${operands.operations.join(",")}`,
            `slots:${operands.slots.map((slot: any) => slot.name).join(",")}`,
            `iterator:${operands.iteratorKind}`,
            `variants:${target.variants.map((variant) => `${variant.degree}:${variant.modulusShapeId}`).join(",")}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};
