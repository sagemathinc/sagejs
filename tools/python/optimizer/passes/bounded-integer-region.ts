import type { OptimizerPassPlugin } from "../catalog";
import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import {
  observeBoundedIntegerCandidate,
  owningFunction,
  planBoundedIntegerRegion,
} from "../domains/bounded-integer/analyze";
import {
  BOUNDED_INTEGER_CODE_SIZE_BUDGET,
  BOUNDED_INTEGER_DOMAIN,
  BOUNDED_INTEGER_INTERNAL_KIND,
  BOUNDED_INTEGER_LOWERING,
  BOUNDED_INTEGER_OPERATION_BUDGET,
  BOUNDED_INTEGER_PLUGIN_PRIORITY,
  BOUNDED_INTEGER_REGION_PASS,
  BOUNDED_INTEGER_VERIFIER,
} from "../domains/bounded-integer/model";
import {
  BOUNDED_INTEGER_REPRESENTATION,
  boundedIntegerRepresentation,
} from "../representations/bounded-integer";
import { planV8BoundedIntegerTarget } from "../targets/v8-bounded-integer";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function catchesInterrupt(compiler: any, ancestors: readonly any[]): boolean {
  return ancestors.some((ancestor) =>
    ancestor instanceof compiler.AST_Try && ancestor.bcatch
  );
}

function genericCandidate(evidence: string, availability: "available" | "selected") {
  return targetCandidate({
    id: "generic-exact-integer-fallback",
    kind: "generic",
    representation: "canonical Number-or-BigInt exact integer",
    availability,
    cost: {
      representationConversions: 0,
      boundaryCrossings: 0,
      copiedBytes: 0,
      materializations: 0,
      emittedBytes: 0,
    },
    evidence,
  });
}

function observationDecision(
  node: any,
  context: OptimizationPassContext,
  observation: ReturnType<typeof observeBoundedIntegerCandidate> & {},
): Omit<
  OptimizationDecision,
  "selected" | "rejectionReasons" | "functionId"
> {
  const source = sourceRegion(node);
  const identity = stableRegionIdentity(BOUNDED_INTEGER_REGION_PASS, source, {
    kind: "bounded-integer-observation",
    operations: observation.operations,
    unsupportedOperations: observation.unsupportedOperations,
    annotatedInputs: observation.annotatedInputs,
    mutableAccesses: observation.mutableAccesses,
    dynamicCalls: observation.dynamicCalls,
  });
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    passId: BOUNDED_INTEGER_REGION_PASS,
    source,
    semantic: {
      level: "sage-semantic" as const,
      revision: 1,
      kind: "python.exact-integer-candidate",
      operations: ["iterate", ...observation.operations.map(
        (operation) => `integer-dispatch:${operation}`
      )],
      observableExits: ["loop-bindings", "mutated-storage", "loop-target"],
      exceptionPolicy:
        "explanation only; the complete original Python region remains executable",
    },
    mathematical: {
      level: "mathematical" as const,
      revision: 1,
      kind: "math.exact-integer-candidate",
      domain: "annotated scalar exact integers and/or packed exact-integer storage",
      operations: observation.operations.length
        ? observation.operations.map((operation) => `integer.${operation}`)
        : ["integer.storage-access"],
      exactness:
        "unbounded exact integer semantics; no machine range has been proved",
    },
    facts: [
      {
        kind: "candidate-exact-integer-shape",
        authority: "static" as const,
        evidence:
          `exact annotations: ${observation.annotatedInputs.join(",") || "none"}`,
      },
      {
        kind: "unsupported-operation-summary",
        authority: "static" as const,
        evidence: observation.unsupportedOperations.join(","),
      },
      {
        kind: "range-cost-summary",
        authority: "static" as const,
        evidence:
          `conversions=${observation.estimatedConversions}; ` +
          `materializations=${observation.estimatedMaterializations}; ` +
          `copied-bytes=${observation.estimatedCopiedBytes}`,
      },
    ],
    representation: {
      level: "representation" as const,
      revision: 1,
      kind: "unproved-exact-integer-representation",
      candidates: [
        BOUNDED_INTEGER_REPRESENTATION,
        "javascript-bigint",
        "packed-fixed-width-integer",
        "generic-number-or-bigint",
      ],
      conversions: [
        `${observation.estimatedConversions} estimated entry conversions`,
        `${observation.estimatedMaterializations} estimated result materializations`,
      ],
      materializations: Number(observation.estimatedMaterializations),
    },
    target: {
      level: "target" as const,
      revision: 1,
      kind: "generic" as const,
      lowering: "none; explain-only exact-integer candidate",
      boundaryCrossings: "runtime-dependent" as const,
      copiedBytes: observation.estimatedCopiedBytes,
      selectedCandidate: "generic-exact-integer-fallback",
      policy: "fail closed until operations, effects, aliases, and ranges are proved",
      candidates: [
        targetCandidate({
          id: "v8-checked-bounded-integer",
          kind: "v8",
          representation: BOUNDED_INTEGER_REPRESENTATION,
          availability: "rejected",
          rejectionReason: observation.reasons[0],
          cost: {
            representationConversions: observation.estimatedConversions,
            copiedBytes: observation.estimatedCopiedBytes,
            materializations: observation.estimatedMaterializations,
          },
          evidence: "requires a complete scalar operation graph and transactional range proof",
        }),
        targetCandidate({
          id: "wasm-bounded-integer",
          kind: "wasm",
          representation: "packed fixed-width exact integers",
          availability: "rejected",
          rejectionReason: "bounded-integer.resident-wasm-unimplemented",
          cost: {
            boundaryCrossings: "runtime-dependent",
            copiedBytes: observation.estimatedCopiedBytes,
          },
          evidence: "no proved resident ownership and overflow contract",
        }),
        targetCandidate({
          id: "native-bounded-integer",
          kind: "native",
          representation: "source-transparent isolated exact integers",
          availability: "rejected",
          rejectionReason: "bounded-integer.native-region-unproved",
          cost: { boundaryCrossings: "runtime-dependent" },
          evidence: "substantial or packed work must use an authenticated coarse boundary",
        }),
        genericCandidate("untouched exact Number/BigInt semantics", "selected"),
      ],
    },
    guards: ["no-executable-proof"],
    fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
    cacheIdentityInputs: [
      `schema:${OPTIMIZER_IR_SCHEMA}`,
      `pass:${BOUNDED_INTEGER_REGION_PASS}`,
      `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
      `semantic-fingerprint:${identity.fingerprint}`,
      `level:${context.controls.level}`,
    ],
  };
}

export const boundedIntegerRegionPass: OptimizationPass = {
  id: BOUNDED_INTEGER_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "builtin-range", "lexical-binding", "structured-effects", "int-annotation-hint",
  ],
  factsProduced: [
    "candidate-exact-integer-shape", "unsupported-operation-summary",
    "range-cost-summary", "exact-integer-annotation-hint",
    "primitive-exact-number-live-ins", "checked-exact-intermediates",
    "transactional-publication", "no-alias", "no-escape", "no-callback",
  ],
  factsInvalidated: [],
  preserves: [
    "python-exact-integer-arithmetic", "sequential-assignment",
    "final-loop-target", "zero-trip-identity", "exceptions", "interrupts",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "primitive-exact-number-live-ins",
    "checked-exact-intermediates", "transactional-publication",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: BOUNDED_INTEGER_VERIFIER,
  compilationCostBudget: BOUNDED_INTEGER_OPERATION_BUDGET,
  codeSizeBudget: BOUNDED_INTEGER_CODE_SIZE_BUDGET,
  requiredEvidence: [
    "exact-o0-cpython-bigint-differential",
    "overflow-alias-mutation-zero-trip-interrupt-corpus",
    "inspectable-ir-and-target-code",
    "inclusive-cold-warm-boundary-benchmark",
    "cubic-class-group-negative-control",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_ForIn) &&
          !(node instanceof context.compiler.AST_While)) return;
      const plan = planBoundedIntegerRegion(context.compiler, node, ancestors);
      if (!plan) {
        const observation = observeBoundedIntegerCandidate(
          context.compiler,
          node,
          ancestors,
        );
        if (!observation) return;
        context.observe({
          node,
          ownerFunction: owningFunction(context.compiler, ancestors),
          minimumLevel: "O2",
          rejectionReasons: observation.reasons,
          decision: observationDecision(node, context, observation),
        });
        return;
      }
      const source = sourceRegion(node);
      const representation = boundedIntegerRepresentation(plan);
      const target = planV8BoundedIntegerTarget(plan);
      const identity = stableRegionIdentity(BOUNDED_INTEGER_REGION_PASS, source, {
        kind: BOUNDED_INTEGER_INTERNAL_KIND,
        slots: plan.slots.map((slot) => slot.name),
        inputSlots: plan.inputSlots,
        stateSlots: plan.stateSlots,
        localSlots: plan.localSlots,
        statements: plan.statements,
        operations: plan.operations,
        integerConstants: plan.integerConstants,
        rangeFacts: plan.rangeFacts,
        operationCost: plan.operationCost,
        targetCodeBytes: plan.targetCodeBytes,
      });
      context.consider({
        minimumLevel: "O2",
        staticRejectionReasons: catchesInterrupt(context.compiler, ancestors)
          ? ["catchable-interrupt-region"] : [],
        node,
        ownerFunction: owningFunction(context.compiler, ancestors),
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id: identity.id,
          passId: BOUNDED_INTEGER_REGION_PASS,
          loweringId: BOUNDED_INTEGER_LOWERING,
          functionId: null,
          guardFailure: "fallback",
          kind: BOUNDED_INTEGER_INTERNAL_KIND,
          operands: plan,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id: identity.id,
          passId: BOUNDED_INTEGER_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "python.transactional-exact-integer-loop",
            operations: [
              "iterate", "sequential-assign", ...plan.operations.map(
                (operation) => `${operation}-dispatch`
              ),
            ],
            observableExits: [
              ...plan.stateSlots.map((slot) => plan.slots[slot].name),
              "loop-target",
            ],
            exceptionPolicy:
              "entry or intermediate guard failure restarts the untouched loop before publication",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.bounded-exact-integer-program",
            domain: "runtime-authenticated Python exact integers",
            operations: plan.operations.map((operation) => `integer.${operation}`),
            exactness:
              "inclusive [-2^53+1,2^53-1] proof for every Number live-in and source intermediate",
          },
          facts: [
            {
              kind: "exact-integer-annotation-hint",
              authority: "static",
              evidence: "every scalar live-in is an exact int-annotated parameter",
            },
            {
              kind: "primitive-exact-number-live-ins",
              authority: "runtime-guard",
              evidence: "all live-ins are primitive integral Numbers inside the inclusive exact range",
            },
            {
              kind: "checked-exact-intermediates",
              authority: "runtime-guard",
              evidence: "every source arithmetic result is range checked before assignment",
            },
            {
              kind: "transactional-publication",
              authority: "static",
              evidence: "private scalar locals are materialized only after the complete loop succeeds",
            },
            { kind: "no-alias", authority: "static", evidence: "primitive lexical scalar slots" },
            { kind: "no-escape", authority: "static", evidence: "no intermediate leaves the loop" },
            { kind: "no-callback", authority: "static", evidence: "guarded primitive arithmetic only" },
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "checked-bounded-exact-integer",
            candidates: [
              representation.id, "javascript-bigint", "generic-number-or-bigint",
            ],
            conversions: [
              "authenticate and copy live-ins once",
              "retain checked primitive Number locals",
              "publish exact Number live-outs transactionally",
            ],
            materializations: representation.resultMaterializations,
          },
          target: {
            level: "target",
            revision: 1,
            kind: "v8",
            lowering: "fused checked JavaScript Number operation graph",
            boundaryCrossings: representation.boundaryCrossings,
            copiedBytes: representation.copiedBytes,
            selectedCandidate: target.id,
            policy: "select only complete scalar regions with exact restart fallback",
            candidates: [
              targetCandidate({
                id: target.id,
                kind: "v8",
                representation: representation.id,
                availability: "selected",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: representation.entryConversions,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  allocations: 0,
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: representation.resultMaterializations,
                  emittedBytes: target.emittedBytes,
                },
                evidence: "one fused primitive loop with an exact check at every arithmetic node",
              }),
              targetCandidate({
                id: "v8-bigint-bounded-integer",
                kind: "v8",
                representation: "javascript-bigint",
                availability: "rejected",
                rejectionReason: "bounded-integer.bigint-per-operation-cost",
                cost: {
                  representationConversions: plan.inputSlots.length,
                  allocations: "runtime-dependent",
                  materializations: plan.stateSlots.length,
                },
                evidence: "exact but allocates arbitrary-precision values in the hot operation graph",
              }),
              targetCandidate({
                id: "wasm-bounded-integer",
                kind: "wasm",
                representation: "fixed-width scalar",
                availability: "rejected",
                rejectionReason: "bounded-integer.scalar-boundary-cost",
                cost: { boundaryCrossings: 1, copiedBytes: 0 },
                evidence: "one tiny scalar region does not justify an isolated target boundary",
              }),
              targetCandidate({
                id: "native-bounded-integer",
                kind: "native",
                representation: "isolated exact integer",
                availability: "rejected",
                rejectionReason: "bounded-integer.scalar-compilation-cost",
                cost: { boundaryCrossings: 1, compileMilliseconds: "runtime-dependent" },
                evidence: "source-transparent native remains appropriate for substantial packed work",
              }),
              genericCandidate("untouched exact Number/BigInt loop", "available"),
            ],
          },
          guards: [
            "safe-iteration-count", "primitive-exact-number-live-ins",
            "checked-exact-intermediates", "transactional-publication",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${BOUNDED_INTEGER_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${plan.operations.join(",")}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};

export const boundedIntegerPlugin: OptimizerPassPlugin = Object.freeze({
  id: BOUNDED_INTEGER_REGION_PASS,
  domainId: BOUNDED_INTEGER_DOMAIN,
  priority: BOUNDED_INTEGER_PLUGIN_PRIORITY,
  claimSemantics: "exclusive",
  loweringIds: Object.freeze([BOUNDED_INTEGER_LOWERING]),
  pass: boundedIntegerRegionPass,
});
