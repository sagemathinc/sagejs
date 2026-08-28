import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { targetCandidate } from "../cost-model";
import { nearestOwningFunction } from "../contracts";
import { stableRegionIdentity } from "../identity";
import { recognizeClosedScalarProgram } from "../canonicalize/scalar-loop";
import {
  MAX_TARGET_CODE_BYTES,
  planV8ScalarCost,
} from "../targets/v8-scalar-cost";
import { CLOSED_RING_REGION_PASS } from "../domains/ids";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

export const closedRingRegionPass: OptimizationPass = {
  id: CLOSED_RING_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: ["builtin-range", "lexical-binding", "structured-effects"],
  factsProduced: [
    "parent-identity", "parent-stable", "method-stability", "fixed-shape",
    "no-alias", "no-escape", "no-callback", "operation-closed", "exact-range",
    "commutative-ring", "referentially-transparent-used-operations",
    "inplace-fallback", "loop-invariant", "dead-store-free",
    "canonical-integer-coercion",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "exceptions", "object-identity-on-zero-trip", "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "same-parent", "reviewed-representation",
    "prototype-and-used-method-identities", "canonical-values",
    "absent-inplace-methods", "sequence-prefix-bounds", "exact-machine-range",
    "canonical-integer-coercion",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: "verifyOptimizationDecision/v1",
  compilationCostBudget: 128,
  codeSizeBudget: MAX_TARGET_CODE_BYTES,
  requiredEvidence: [
    "generated-enabled-disabled-differential", "held-out-source-corpus",
    "guard-and-alias-adversarial", "node-and-three-browser-route",
    "public-workload-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const canonical = recognizeClosedScalarProgram(context.compiler, node);
      if (!canonical) return;
      const operands = planV8ScalarCost(canonical);
      if (operands.targetCodeBytes > MAX_TARGET_CODE_BYTES) return;
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(CLOSED_RING_REGION_PASS, source, {
        kind: "closed-ring-region",
        iteratorKind: operands.iteratorKind,
        iterationOrder: operands.iterationOrder,
        zipStrict: operands.zipStrict,
        zipSequences: operands.iteratorKind === "zip"
          ? operands.zipIterables.map((source: any) => source.name)
          : [],
        zipTargets: operands.iteratorKind === "zip"
          ? operands.zipTargets.map((target: any) => target.name)
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
      });
      const id = identity.id;
      context.consider({
        minimumLevel: "O2",
        staticRejectionReasons: ancestors.some((ancestor) =>
          ancestor instanceof context.compiler.AST_Try && ancestor.bcatch
        ) ? ["catchable-interrupt-region"] : [],
        node,
        ownerFunction: nearestOwningFunction(context.compiler, ancestors),
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_RING_REGION_PASS,
          loweringId: "v8.closed-ring-loop.v1",
          functionId: null,
          guardFailure: "fallback",
          kind: "closed-ring-region",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_RING_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.closed-ring-loop",
            operations: [
              "iterate", "sequential-assign", ...operands.operations.map(
                (operation: string) => `${operation}-dispatch`
              ),
              ...operands.inplaceOperations.map(
                (operation: string) => `inplace-${operation}-fallback-dispatch`
              ),
            ],
            observableExits: [
              ...operands.stateSlots.map((slot: number) => operands.slots[slot].name),
              "loop-target",
            ],
            exceptionPolicy: "entry guards precede optimized effects; exact loop fallback",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.closed-commutative-ring-program",
            domain: "one guarded finite commutative ring or fixed finite-field parent",
            operations: operands.operations.map(
              (operation: string) => `math.ring.${operation}`
            ),
            exactness: "runtime parent/shape/method guards plus exact Number range",
          },
          facts: [
            { kind: "no-alias", authority: "static", evidence: "distinct lexical state bindings" },
            { kind: "no-escape", authority: "static", evidence: "only local state assignments and control flow occur in the region" },
            { kind: "no-callback", authority: "runtime-guard", evidence: "all used operator identities match reviewed immutable finite-field methods" },
            { kind: "referentially-transparent-used-operations", authority: "runtime-guard", evidence: "reviewed canonical ring operations are pure after parent, brand, and method-identity guards" },
            ...(operands.inplaceOperations.length ? [{ kind: "inplace-fallback", authority: "runtime-guard" as const, evidence: "every live-in and reviewed prototype chain lacks the corresponding Python __i*__ descriptor" }] : []),
            { kind: "parent-identity", authority: "runtime-guard", evidence: "all scalar and sequence values share one parent" },
            { kind: "fixed-shape", authority: "runtime-guard", evidence: "the selected parent advertises a reviewed fixed representation" },
            { kind: "exact-range", authority: "runtime-guard", evidence: "the selected representation validates canonical values and machine intermediates" },
            { kind: "commutative-ring", authority: "runtime-guard", evidence: "the selected machine parent explicitly advertises reviewed commutative multiplication" },
            ...(operands.eliminatedAssignments ? [{ kind: "dead-store-free", authority: "static" as const, evidence: "backward liveness over the semantic statement graph proves overwritten pure assignments unobservable" }] : []),
            ...(operands.hoistedExpressions.length ? [{ kind: "loop-invariant", authority: "static" as const, evidence: "hoisted expression slots are live-in and absent from the complete modified-slot set" }] : []),
            ...(operands.integerConstants.length ? [{ kind: "canonical-integer-coercion", authority: "runtime-guard" as const, evidence: "the live ZZ-to-parent coercion plan and every transitive dispatch identity match the reviewed canonical embedding" }] : []),
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-unboxed-ring-program",
            candidates: ["number-residue", "extension-tuple-number", "boxed-sage-value"],
            conversions: [
              operands.sequenceStrategy === "stream"
                ? "unbox live-ins and validate sequence elements while streaming"
                : "unbox live-ins and sequence prefixes",
              ...(operands.hoistedExpressions.length
                ? ["evaluate pure loop-invariant subgraphs once in the guarded preheader"]
                : []),
              ...(operands.eliminatedAssignments
                ? ["omit overwritten pure assignments from the lowered graph"]
                : []),
              ...(operands.integerConstants.length
                ? ["embed guarded canonical integer residues once in the region preheader"]
                : []),
              "materialize modified live-outs",
            ],
            materializations: operands.stateSlots.length,
          },
          target: {
            level: "target",
            revision: 1,
            kind: operands.affine?.kind === "fixed-increment" ? "adaptive" : "v8",
            lowering: operands.affine?.kind === "fixed-increment"
              ? "trip-count-gated isolated affine target or monomorphic scalar operation graph"
              : operands.sequenceStrategy === "stream"
                ? "transactional streaming operation graph over guarded sequence elements"
              : "monomorphic scalar locals generated from target-neutral field operations",
            boundaryCrossings: operands.affine?.kind === "fixed-increment"
              ? "runtime-dependent"
              : 0,
            copiedBytes: "runtime-dependent",
            selectedCandidate: operands.affine?.kind === "fixed-increment"
              ? "runtime-adaptive"
              : "v8-closed-ring-program",
            policy: operands.affine?.kind === "fixed-increment"
              ? "guarded representation, trip count, and authenticated isolated-target availability"
              : operands.sequenceStrategy === "stream"
                ? "guarded streaming sequence with transactional materialization and exact restart fallback"
              : "bounded monomorphic scalar region with one entry validation",
            candidates: [
              targetCandidate({
                id: "v8-closed-ring-program",
                kind: "v8",
                representation: "number-residue or extension-tuple-number",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "selected",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: "runtime-dependent",
                  boundaryCrossings: 0,
                  copiedBytes: "runtime-dependent",
                  allocations: "runtime-dependent",
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: operands.stateSlots.length,
                  emittedBytes: "runtime-dependent",
                },
                evidence: "guarded monomorphic operation graph emitted as primitive locals",
              }),
              targetCandidate({
                id: "wasm-resident-ring-program",
                kind: "wasm",
                representation: "packed or resident field values",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "rejected",
                rejectionReason: operands.affine?.kind === "fixed-increment"
                  ? null
                  : "resident-general-region-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine?.kind === "fixed-increment"
                  ? "source-transparent packed quadratic kernel in the authenticated Wasm pack"
                  : "candidate retained for the same Mathematical IR; no general resident lowering yet",
              }),
              targetCandidate({
                id: "native-isolated-ring-program",
                kind: "native",
                representation: "packed fixed-shape field values",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "rejected",
                rejectionReason: operands.affine?.kind === "fixed-increment"
                  ? null
                  : "general-operation-graph-native-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine?.kind === "fixed-increment"
                  ? "source-transparent packed quadratic kernel in the production native pack"
                  : "isolated affine witness exists; general operation graph is not silently substituted",
              }),
              targetCandidate({
                id: "generic-ring-program-fallback",
                kind: "generic",
                representation: "boxed-sage-value",
                availability: "available",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 0,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  materializations: 0,
                  emittedBytes: 0,
                },
                evidence: "untouched semantic loop",
              }),
            ],
          },
          guards: [
            "safe-iteration-count", "same-parent", "reviewed-representation",
            "prototype-and-used-method-identities", "canonical-values",
            "absent-inplace-methods", "sequence-prefix-bounds",
            "zip-length-contract", "exact-machine-range",
            ...(operands.integerConstants.length
              ? ["canonical-integer-coercion"]
              : []),
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${CLOSED_RING_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${operands.operations.join(",")}`,
            `slots:${operands.slots.map((slot: any) => slot.name).join(",")}`,
            `iterator:${operands.iteratorKind}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};
