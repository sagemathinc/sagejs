import { nearestOwningFunction } from "../contracts";
import {
  MODULAR_BATCH_DOMAIN,
  MODULAR_BATCH_INTERNAL_KIND,
  MODULAR_BATCH_LOWERING,
  MODULAR_BATCH_PLUGIN_PRIORITY,
  MODULAR_BATCH_REGION_PASS,
  MODULAR_BATCH_VERIFIER,
} from "../domains/modular-batch/ir";
import { recognizeModularBatchProgram } from
  "../domains/modular-batch/recognize";
import { stableRegionIdentity } from "../identity";
import {
  MAX_MODULAR_BATCH_CODE_BYTES,
  planModularBatchRepresentation,
} from "../representations/modular-batch";
import {
  modularBatchPublicCandidates,
  planModularBatchTargets,
} from "../targets/modular-batch";
import {
  OPTIMIZER_IR_SCHEMA,
  InternalRegionPlan,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { verifyModularBatchInternalRegionPlan } from
  "../verifiers/modular-batch";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function fallbackDecision(
  node: any,
  source: SourceRegion,
  reason: string,
): any {
  const identity = stableRegionIdentity(MODULAR_BATCH_REGION_PASS, source, {
    kind: "rejected-modular-batch-region",
    reason,
  });
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    passId: MODULAR_BATCH_REGION_PASS,
    source,
    semantic: {
      level: "sage-semantic",
      revision: 1,
      kind: "sage.indexed-batch-candidate",
      operations: ["iterate", "indexed-read", "indexed-write"],
      observableExits: ["output-container", "loop-target"],
      exceptionPolicy: "untouched semantic loop",
    },
    mathematical: {
      level: "mathematical",
      revision: 1,
      kind: "math.rejected-modular-batch",
      domain: "unproved modular batch",
      operations: ["math.ring.unknown"],
      exactness: "not established",
    },
    facts: [{
      kind: "explicit-domain-contract",
      authority: "contract",
      evidence: "the enclosing function explicitly requests the modular-batch pass",
    }],
    representation: {
      level: "representation",
      revision: 1,
      kind: "boxed-semantic-fallback",
      candidates: ["boxed-sage-value"],
      conversions: [],
      materializations: 0,
    },
    target: {
      level: "target",
      revision: 1,
      kind: "generic",
      lowering: "untouched indexed Python loop",
      boundaryCrossings: 0,
      copiedBytes: 0,
      selectedCandidate: "generic-modular-batch-fallback",
      policy: "reject without every complete-batch proof",
      candidates: [
        {
          id: "v8-complete-modular-batch",
          kind: "v8",
          representation: "unproved",
          availability: "rejected",
          rejectionReason: reason,
          cost: {
            arithmeticOperations: "runtime-dependent",
            representationConversions: "runtime-dependent",
            boundaryCrossings: 0,
            copiedBytes: "runtime-dependent",
            allocations: "runtime-dependent",
            cleanupOperations: 0,
            compileMilliseconds: "runtime-dependent",
            instantiateMilliseconds: 0,
            loadMilliseconds: 0,
            materializations: "runtime-dependent",
            emittedBytes: "runtime-dependent",
            totalUnits: "runtime-dependent",
          },
          evidence: "candidate rejected before representation selection",
        },
        {
          id: "generic-modular-batch-fallback",
          kind: "generic",
          representation: "boxed-sage-value",
          availability: "selected",
          rejectionReason: null,
          cost: {
            arithmeticOperations: "runtime-dependent",
            representationConversions: 0,
            boundaryCrossings: 0,
            copiedBytes: 0,
            allocations: "runtime-dependent",
            cleanupOperations: "runtime-dependent",
            compileMilliseconds: 0,
            instantiateMilliseconds: 0,
            loadMilliseconds: 0,
            materializations: 0,
            emittedBytes: 0,
            totalUnits: "runtime-dependent",
          },
          evidence: "the source loop is retained byte-for-byte at the semantic boundary",
        },
      ],
    },
    guards: ["explicit-modular-batch-contract"],
    fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
    cacheIdentityInputs: [
      `schema:${OPTIMIZER_IR_SCHEMA}`,
      `pass:${MODULAR_BATCH_REGION_PASS}`,
      `source:${source.filename}:${source.line}:${source.column}`,
      `rejection:${reason}`,
      `node:${node?.constructor?.name ?? "unknown"}`,
    ],
  };
}

export const modularBatchRegionPass: OptimizationPass = {
  id: MODULAR_BATCH_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "explicit-optimization-contract", "builtin-range", "lexical-binding",
    "structured-effects",
  ],
  factsProduced: [
    "parent-identity", "parent-stable", "method-stability",
    "canonical-integer-coercion", "canonical-value", "no-alias",
    "no-escape", "no-callback", "exact-range", "operation-closed",
    "complete-batch-publication",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "source-evaluation-order", "indexed-exceptions",
    "final-loop-target", "zero-trip-output", "parent-identity",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "fresh-output-length",
    "immutable-input-sequences", "same-parent",
    "canonical-residue-elements", "prototype-and-used-method-identities",
    "canonical-integer-coercion", "exact-intermediate-bounds",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: MODULAR_BATCH_VERIFIER,
  compilationCostBudget: 96,
  codeSizeBudget: MAX_MODULAR_BATCH_CODE_BYTES,
  requiredEvidence: [
    "generated-o0-exact-bigint-differential",
    "parent-method-coercion-mutation-fallback",
    "alias-and-late-element-adversarial",
    "zero-trip-and-indexed-exception-timing",
    "v8-wasm-native-inclusive-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_ForIn)) return;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
      if (ownerFunction?.optimization_contract?.requiredPassId !==
          MODULAR_BATCH_REGION_PASS) return;
      const source = sourceRegion(node);
      const recognition = recognizeModularBatchProgram(
        context.compiler, node, ownerFunction,
      );
      if ("reasons" in recognition) {
        const reason = recognition.reasons[0];
        context.observe({
          minimumLevel: "O2",
          node,
          ownerFunction,
          rejectionReasons: recognition.reasons,
          decision: fallbackDecision(node, source, reason),
        });
        return;
      }
      const represented = planModularBatchRepresentation(recognition.program);
      const operands = planModularBatchTargets(represented);
      const identity = stableRegionIdentity(MODULAR_BATCH_REGION_PASS, source, {
        kind: MODULAR_BATCH_INTERNAL_KIND,
        iteratorName: operands.iteratorName,
        countName: operands.countName,
        outputName: operands.outputName,
        inputs: operands.inputs.map(({ name, uses }) => ({ name, uses })),
        expression: operands.expression,
        operations: operands.operations,
        integerConstants: operands.integerConstants,
        operationCost: operands.operationCost,
        aliasProof: operands.aliasProof,
        representation: operands.representation,
        targetComparison: operands.targetComparison,
        targetCodeBytes: operands.targetCodeBytes,
      });
      const internal: InternalRegionPlan = {
        schema: OPTIMIZER_IR_SCHEMA,
        id: identity.id,
        passId: MODULAR_BATCH_REGION_PASS,
        loweringId: MODULAR_BATCH_LOWERING,
        functionId: null,
        guardFailure: "fallback" as const,
        kind: MODULAR_BATCH_INTERNAL_KIND,
        operands,
      };
      verifyModularBatchInternalRegionPlan(internal);
      context.consider({
        minimumLevel: "O2",
        node,
        ownerFunction,
        internal,
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id: identity.id,
          passId: MODULAR_BATCH_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.complete-indexed-modular-batch",
            operations: [
              "builtin-range-iteration", "indexed-getitem",
              ...operands.operations.map((operation) => `${operation}-dispatch`),
              "indexed-setitem",
            ],
            observableExits: [operands.outputName, "loop-target"],
            exceptionPolicy:
              "all guards and element validation precede private computation; exact loop fallback precedes publication",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.complete-modular-residue-batch",
            domain: "one guarded small prime or composite modular residue parent",
            operations: operands.operations.map((operation) =>
              operation === "coerce-integer"
                ? "math.parent.coerce-integer"
                : `math.ring.${operation}`
            ),
            exactness:
              "canonical residues in [0,p-1] and independently verified bounds for every Number intermediate",
          },
          facts: [
            {
              kind: "no-alias",
              authority: "static",
              evidence:
                "the output is a fresh list comprehension immediately before the loop and is absent from every indexed read",
            },
            {
              kind: "complete-batch-publication",
              authority: "static",
              evidence:
                "the same guarded count indexes every input, the private stage, and the fresh output",
            },
            {
              kind: "parent-identity",
              authority: "runtime-guard",
              evidence: "every input element has the same authenticated modular parent",
            },
            {
              kind: "method-stability",
              authority: "runtime-guard",
              evidence: "every used arithmetic descriptor matches the reviewed canonical implementation",
            },
            ...(operands.integerConstants.length ? [{
              kind: "canonical-integer-coercion",
              authority: "runtime-guard" as const,
              evidence: "the complete live ZZ-to-parent coercion plan is authenticated",
            }] : []),
            {
              kind: "exact-range",
              authority: "contract",
              evidence:
                `guarded p <= ${operands.representation.exactBounds.modulusMaximum}; ` +
                operands.representation.exactBounds.intermediates.map((bound) =>
                  `${bound.operation}:${bound.formula}<=${bound.maximumAtAcceptedModulus}`
                ).join(","),
            },
            {
              kind: "no-callback",
              authority: "runtime-guard",
              evidence: "branded frozen tuple inputs and canonical element methods are validated before computation",
            },
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: operands.representation.id,
            candidates: [
              "float64-number-residue-batch", "wasm-resident-residue-batch",
              "native-packed-residue-batch", "boxed-sage-values",
            ],
            conversions: [
              "validate and pack every input before computation",
              "compute every residue into private output storage",
              "publish materialized parented values only after complete success",
            ],
            materializations: 1,
          },
          target: {
            level: "target",
            revision: 1,
            kind: "v8",
            lowering: "monomorphic complete batch over Number residue buffers",
            boundaryCrossings: 0,
            copiedBytes: "runtime-dependent",
            selectedCandidate: operands.targetComparison.selected,
            candidates: modularBatchPublicCandidates(operands.targetComparison),
            policy: operands.targetComparison.policy,
          },
          guards: [
            "safe-iteration-count", "fresh-output-length",
            "immutable-input-sequences", "same-parent",
            "canonical-residue-elements",
            "prototype-and-used-method-identities",
            ...(operands.integerConstants.length
              ? ["canonical-integer-coercion"] : []),
            "exact-intermediate-bounds",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${MODULAR_BATCH_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${operands.operations.join(",")}`,
            `inputs:${operands.inputs.map(({ name }) => name).join(",")}`,
            `output:${operands.outputName}`,
            `representation:${operands.representation.id}`,
            `target-policy:${operands.targetComparison.policy}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};

/** Registration payload; the integration lane owns insertion into the catalog. */
export const modularBatchPlugin = Object.freeze({
  id: MODULAR_BATCH_REGION_PASS,
  domainId: MODULAR_BATCH_DOMAIN,
  priority: MODULAR_BATCH_PLUGIN_PRIORITY,
  claimSemantics: "exclusive" as const,
  loweringIds: Object.freeze([MODULAR_BATCH_LOWERING]),
  pass: modularBatchRegionPass,
});
