import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { recognizeClosedScalarProgram } from "../canonicalize/scalar-loop";
import { nearestOwningFunction } from "../contracts";
import { STRICT_FLOAT_REGION_PASS } from "../domains/ids";
import { planV8ScalarCost } from "../targets/v8-scalar-cost";


function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function annotatedFloatArguments(
  compiler: any,
  ancestors: readonly any[],
  operands: Record<string, any>,
): Array<{ slot: number; argument: any }> | null {
  let definition: any = null;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (ancestors[index] instanceof compiler.AST_Function) {
      definition = ancestors[index];
      break;
    }
  }
  if (!definition) return null;
  const byName = new Map<string, any>();
  for (const argument of definition.argnames ?? []) {
    if (argument?.annotation instanceof compiler.AST_SymbolRef &&
        argument.annotation.name === "float" &&
        argument.annotation_text === "float") {
      byName.set(argument.name, argument);
    }
  }
  const witnesses: Array<{ slot: number; argument: any }> = [];
  for (const slot of operands.inputSlots) {
    const argument = byName.get(operands.slots[slot]?.name);
    if (!argument) return null;
    witnesses.push({ slot, argument });
  }
  return witnesses;
}

export const strictFloatRegionPass: OptimizationPass = {
  id: STRICT_FLOAT_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "builtin-range", "lexical-binding", "structured-effects",
    "float-annotation-hint",
  ],
  factsProduced: [
    "float-annotation-hint", "strict-binary64", "source-operation-order",
    "fixed-primitive-shape",
    "no-alias", "no-escape", "no-callback", "dead-store-free",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "binary64-rounding-points", "nan-semantics", "signed-zero",
    "infinities", "exceptions", "object-identity-on-zero-trip",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "strict-python-float-live-ins",
    "canonical-boxed-float-prototype", "numeric-intrinsic-identities",
  ],
  supportedTargets: ["v8", "generic"],
  verifier: "verifyOptimizationDecision/v1",
  compilationCostBudget: 96,
  codeSizeBudget: 16384,
  requiredEvidence: [
    "bit-pattern-o0-differential", "nan-infinity-signed-zero-corpus",
    "annotation-mismatch-fallback", "intrinsic-mutation-fallback",
    "warm-cross-runtime-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const canonical = recognizeClosedScalarProgram(context.compiler, node);
      if (!canonical || canonical.iteratorKind !== "range") return;
      const operands = planV8ScalarCost(canonical);
      if (
          operands.sequences.length !== 0 ||
          operands.integerConstants.length !== 0 ||
          operands.inplaceOperations.length !== 0 ||
          operands.targetCodeBytes > 16384 ||
          operands.operations.some((operation: string) =>
            !["add", "sub", "mul", "neg", "equal"].includes(operation))) return;
      const annotations = annotatedFloatArguments(
        context.compiler, ancestors, operands,
      );
      if (!annotations) return;
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(STRICT_FLOAT_REGION_PASS, source, {
        kind: "strict-float-region",
        slots: operands.slots.map((slot: any) => slot.name),
        inputSlots: operands.inputSlots,
        stateSlots: operands.stateSlots,
        localSlots: operands.localSlots,
        semanticStatements: operands.semanticStatements,
        statements: operands.statements,
        eliminatedAssignments: operands.eliminatedAssignments,
        operations: operands.operations,
        operationCost: operands.operationCost,
        targetCodeBytes: operands.targetCodeBytes,
        annotatedInputs: annotations.map(({ slot }) => slot),
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
          passId: STRICT_FLOAT_REGION_PASS,
          loweringId: "v8.strict-float-loop.v1",
          functionId: null,
          guardFailure: "fallback",
          kind: "strict-float-region",
          operands: {
            ...operands,
            annotatedFloatArguments: annotations,
          },
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: STRICT_FLOAT_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "python.strict-floating-loop",
            operations: [
              "iterate", "sequential-assign", ...operands.operations.map(
                (operation: string) => `${operation}-dispatch`
              ),
            ],
            observableExits: [
              ...operands.stateSlots.map(
                (slot: number) => operands.slots[slot].name
              ),
              "loop-target",
            ],
            exceptionPolicy:
              "entry guards precede optimized effects; untouched loop fallback",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.ordered-binary64-program",
            domain:
              "runtime-authenticated Python float/RDF binary64 live-ins",
            operations: operands.operations.map(
              (operation: string) => `ieee754.binary64.${operation}`
            ),
            exactness:
              "source-ordered binary64 operations with no reassociation, contraction, or fast-math",
          },
          facts: [
            {
              kind: "float-annotation-hint",
              authority: "static",
              evidence:
                "every live-in scalar is a parameter spelled with the exact float annotation",
            },
            {
              kind: "strict-binary64",
              authority: "runtime-guard",
              evidence:
                "each live-in is an authentic Python float primitive or canonical boxed integral float",
            },
            {
              kind: "source-operation-order",
              authority: "static",
              evidence:
                "the lowering emits one JavaScript Number operation for each source tree node in source order",
            },
            {
              kind: "no-alias",
              authority: "static",
              evidence: "distinct lexical scalar bindings",
            },
            {
              kind: "no-escape",
              authority: "static",
              evidence:
                "the region contains only local scalar assignments and comparisons",
            },
            {
              kind: "no-callback",
              authority: "runtime-guard",
              evidence:
                "primitive or canonical boxed floats cannot install per-value arithmetic methods",
            },
            ...(operands.eliminatedAssignments ? [{
              kind: "dead-store-free",
              authority: "static" as const,
              evidence:
                "backward liveness removes only overwritten nonthrowing binary64 assignments",
            }] : []),
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-strict-binary64-program",
            candidates: [
              "javascript-number", "canonical-boxed-python-float",
              "generic-python-value",
            ],
            conversions: [
              "unbox authenticated live-ins once",
              "retain source-ordered primitive Number locals",
              "materialize Python float identity for modified live-outs",
            ],
            materializations: operands.stateSlots.length,
          },
          target: {
            level: "target",
            revision: 1,
            kind: "v8",
            lowering: "monomorphic source-ordered JavaScript Number locals",
            boundaryCrossings: 0,
            copiedBytes: 0,
            selectedCandidate: "v8-strict-binary64",
            policy:
              "strict IEEE semantics at O2; reassociation and contraction are forbidden",
            candidates: [
              targetCandidate({
                id: "v8-strict-binary64",
                kind: "v8",
                representation: "primitive JavaScript Number",
                availability: "selected",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: operands.inputSlots.length +
                    operands.stateSlots.length,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  allocations: operands.stateSlots.length,
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: operands.stateSlots.length,
                  emittedBytes: "runtime-dependent",
                },
                evidence:
                  "guarded Number locals with one emitted operation per source node",
              }),
              targetCandidate({
                id: "generic-strict-float-fallback",
                kind: "generic",
                representation: "ordinary Python/Sage values",
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
            "safe-iteration-count", "strict-python-float-live-ins",
            "canonical-boxed-float-prototype", "numeric-intrinsic-identities",
          ],
          fallbackId:
            `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${STRICT_FLOAT_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${operands.operations.join(",")}`,
            `slots:${operands.slots.map((slot: any) => slot.name).join(",")}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};
