import type { OptimizerPassPlugin } from "../catalog";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  STRICT_FLOAT_ARRAY_DOMAIN,
  STRICT_FLOAT_ARRAY_INTERNAL_KIND,
  STRICT_FLOAT_ARRAY_LOWERING,
  STRICT_FLOAT_ARRAY_PASS,
  STRICT_FLOAT_ARRAY_VERIFIER,
  recognizeStrictFloatArrayProgram,
} from "../domains/strict-binary64-array";
import { stableRegionIdentity } from "../identity";
import { planBinary64ArrayRepresentation } from
  "../representations/binary64-array";
import {
  STRICT_FLOAT_ARRAY_CODE_SIZE_BUDGET,
  planV8StrictFloatArrayTarget,
} from "../targets/v8-strict-float-array";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

export const strictFloatArrayRegionPass: OptimizationPass = {
  id: STRICT_FLOAT_ARRAY_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "explicit-optimization-contract", "builtin-tuple-annotation",
    "lexical-binding", "structured-effects", "float-annotation-hint",
  ],
  factsProduced: [
    "strict-binary64", "immutable-sequence", "source-operation-order",
    "fixed-primitive-shape", "no-published-writes", "no-callback",
    "transactional-restart", "dead-store-free",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "binary64-rounding-points", "nan-semantics", "signed-zero",
    "infinities", "exception-timing", "aliasing", "zero-trip-identity",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "immutable-tuple-brand", "strict-python-float-live-ins",
    "strict-python-float-elements", "canonical-boxed-float-prototype",
    "numeric-intrinsic-identities",
  ],
  supportedTargets: ["v8", "generic"],
  verifier: STRICT_FLOAT_ARRAY_VERIFIER,
  compilationCostBudget: 128,
  codeSizeBudget: STRICT_FLOAT_ARRAY_CODE_SIZE_BUDGET,
  requiredEvidence: [
    "bit-pattern-o0-cpython-differential",
    "nan-infinity-signed-zero-sequence-corpus",
    "late-invalid-element-transactional-fallback",
    "alias-zero-trip-final-target-tests",
    "cold-warm-compile-cross-runtime-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const program = recognizeStrictFloatArrayProgram(
        context.compiler,
        node,
        ancestors,
      );
      if (!program) return;
      const representation = planBinary64ArrayRepresentation(program);
      const target = planV8StrictFloatArrayTarget(program);
      if (!target) return;

      const source = sourceRegion(node);
      const identity = stableRegionIdentity(STRICT_FLOAT_ARRAY_PASS, source, {
        kind: STRICT_FLOAT_ARRAY_INTERNAL_KIND,
        iteratorKind: program.iteratorKind,
        iterationOrder: program.iterationOrder,
        slots: program.slots.map((slot) => slot.name),
        sequence: program.sequences[0].name,
        inputSlots: program.inputSlots,
        stateSlots: program.stateSlots,
        localSlots: program.localSlots,
        semanticStatements: program.semanticStatements,
        statements: program.statements,
        eliminatedAssignments: program.eliminatedAssignments,
        operations: program.operations,
        representation,
        target,
      });
      const id = identity.id;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
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
          passId: STRICT_FLOAT_ARRAY_PASS,
          loweringId: STRICT_FLOAT_ARRAY_LOWERING,
          functionId: null,
          guardFailure: "fallback",
          kind: STRICT_FLOAT_ARRAY_INTERNAL_KIND,
          operands: {
            iteratorKind: program.iteratorKind,
            iterationOrder: program.iterationOrder,
            iterable: program.iterable,
            iterator: program.iterator,
            slots: program.slots,
            sequences: program.sequences,
            inputSlots: program.inputSlots,
            stateSlots: program.stateSlots,
            localSlots: program.localSlots,
            semanticStatements: program.semanticStatements,
            statements: program.statements,
            eliminatedAssignments: program.eliminatedAssignments,
            operations: program.operations,
            sequenceUses: program.sequenceUses,
            sequenceAccesses: program.sequenceAccesses,
            annotatedFloatArguments: program.annotatedFloatArguments,
            annotatedSequence: program.annotatedSequence,
            ...representation,
            ...target,
          },
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: STRICT_FLOAT_ARRAY_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "python.strict-floating-sequence-reduction",
            operations: [
              "iterate-immutable-tuple", "bind-loop-target",
              "sequential-assign",
              ...program.operations.map((operation) => `${operation}-dispatch`),
            ],
            observableExits: [
              ...program.stateSlots.map((slot) => program.slots[slot].name),
              "loop-target",
            ],
            exceptionPolicy:
              "private primitive state is discarded and the untouched loop restarts on any failed element guard",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.ordered-binary64-sequence-program",
            domain:
              "runtime-authenticated immutable tuple of Python binary64 floats",
            operations: program.operations.map(
              (operation) => `ieee754.binary64.${operation}`,
            ),
            exactness:
              "one binary64 operation per retained source node in source order; no reassociation, contraction, or fast-math",
          },
          facts: [
            {
              kind: "explicit-optimization-contract",
              authority: "static",
              evidence:
                "the owning function explicitly requires math.strict-float-array-region.v1",
            },
            {
              kind: "float-annotation-hint",
              authority: "static",
              evidence:
                "live scalar inputs are exact float annotations and the source is tuple[float, ...]",
            },
            {
              kind: "strict-binary64",
              authority: "runtime-guard",
              evidence:
                "every scalar and consumed sequence element authenticates through the canonical float unboxer",
            },
            {
              kind: "immutable-sequence",
              authority: "runtime-guard",
              evidence:
                "the source must carry the private frozen tuple brand before direct indexing",
            },
            {
              kind: "source-operation-order",
              authority: "static",
              evidence:
                "the emitter recursively evaluates left, right, then one Number operation for every retained source node",
            },
            {
              kind: "no-published-writes",
              authority: "static",
              evidence:
                "loop-carried values remain private Number locals until all elements complete",
            },
            {
              kind: "transactional-restart",
              authority: "contract",
              evidence:
                "a failed element guard discards private locals and executes the untouched semantic loop from original inputs",
            },
            ...(program.eliminatedAssignments ? [{
              kind: "dead-store-free",
              authority: "static" as const,
              evidence:
                "backward liveness removes only overwritten nonthrowing binary64 assignments",
            }] : []),
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-immutable-binary64-tuple",
            candidates: [
              "streamed-javascript-number", "canonical-boxed-python-float",
              "generic-python-value",
            ],
            conversions: [
              "unbox authenticated scalar live-ins once",
              "unbox each immutable tuple element once immediately before use",
              "materialize modified Python float live-outs only after success",
            ],
            materializations: representation.materializations,
          },
          target: {
            level: "target",
            revision: 1,
            kind: "v8",
            lowering:
              "transactional source-ordered JavaScript Number reduction over a branded immutable tuple",
            boundaryCrossings: 0,
            copiedBytes: representation.copiedBytes,
            selectedCandidate: "v8-strict-binary64-array",
            policy:
              "explicit-contract-only O2 V8 lowering with late-guard restart and no fast-math",
            candidates: [
              targetCandidate({
                id: "v8-strict-binary64-array",
                kind: "v8",
                representation: "streamed primitive JavaScript Number",
                availability: "selected",
                cost: {
                  arithmeticOperations: target.emittedOperationNodes,
                  representationConversions: "runtime-dependent",
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  allocations: representation.materializations,
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: representation.materializations,
                  emittedBytes: target.targetCodeBytes,
                },
                evidence:
                  "immutable tuple streaming with transactional private scalar state",
              }),
              targetCandidate({
                id: "generic-strict-float-array-fallback",
                kind: "generic",
                representation: "ordinary Python sequence and values",
                availability: "available",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 0,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  allocations: "runtime-dependent",
                  cleanupOperations: "runtime-dependent",
                  materializations: 0,
                  emittedBytes: 0,
                },
                evidence: "untouched semantic loop",
              }),
            ],
          },
          guards: [
            "immutable-tuple-brand", "strict-python-float-live-ins",
            "strict-python-float-elements", "canonical-boxed-float-prototype",
            "numeric-intrinsic-identities",
          ],
          fallbackId:
            `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${STRICT_FLOAT_ARRAY_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${program.operations.join(",")}`,
            `order:${program.iterationOrder}`,
            `slots:${program.slots.map((slot) => slot.name).join(",")}`,
            `sequence:${program.sequences[0].name}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};

/** Frozen registration object consumed only by the integration-owned catalog. */
export const strictFloatArrayPlugin: OptimizerPassPlugin = Object.freeze({
  id: STRICT_FLOAT_ARRAY_PASS,
  domainId: STRICT_FLOAT_ARRAY_DOMAIN,
  priority: 250,
  claimSemantics: "exclusive",
  loweringIds: Object.freeze([STRICT_FLOAT_ARRAY_LOWERING]),
  pass: strictFloatArrayRegionPass,
});
