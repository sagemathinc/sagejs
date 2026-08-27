import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";

export const CLOSED_AFFINE_RECURRENCE_PASS =
  "math.closed-affine-recurrence.v1";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function recognize(compiler: any, loop: any): null | Record<string, any> {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      loop.builtin_range === false) return null;
  const init = loop.init;
  const object = loop.object;
  const body = loop.body;
  if (!(init instanceof compiler.AST_SymbolRef)) return null;
  if (!(object instanceof compiler.AST_Call) ||
      !(object.expression instanceof compiler.AST_SymbolRef) ||
      object.expression.name !== "range" || object.args?.length !== 1 ||
      object.args.starargs || object.args.kwargs?.length ||
      object.args.kwarg_items?.length) return null;
  const count = object.args[0];
  if (!(count instanceof compiler.AST_SymbolRef) &&
      !(count instanceof compiler.AST_Number)) return null;
  if (!(body instanceof compiler.AST_BlockStatement) ||
      body.body?.length !== 1) return null;
  const statement = body.body[0];
  if (!(statement instanceof compiler.AST_SimpleStatement)) return null;
  const assignment = statement.body;
  if (!(assignment instanceof compiler.AST_Assign) ||
      assignment.operator !== "=" ||
      !(assignment.left instanceof compiler.AST_SymbolRef)) return null;
  const addition = assignment.right;
  if (!(addition instanceof compiler.AST_Binary) ||
      addition.operator !== "+" ||
      !(addition.right instanceof compiler.AST_SymbolRef)) return null;
  const multiplication = addition.left;
  if (!(multiplication instanceof compiler.AST_Binary) ||
      multiplication.operator !== "*" ||
      !(multiplication.left instanceof compiler.AST_SymbolRef) ||
      !(multiplication.right instanceof compiler.AST_SymbolRef)) return null;
  const accumulator = assignment.left;
  if (multiplication.left.name !== accumulator.name) return null;
  const names = [
    accumulator.name,
    multiplication.right.name,
    addition.right.name,
  ];
  if (new Set(names).size !== 3 || names.includes(init.name)) return null;
  return {
    accumulator,
    multiplier: multiplication.right,
    increment: addition.right,
    count,
    index: init,
  };
}

export const closedAffineRecurrencePass: OptimizationPass = {
  id: CLOSED_AFFINE_RECURRENCE_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: ["builtin-range", "lexical-binding"],
  factsProduced: [
    "no-alias", "no-escape", "no-callback", "operation-closed",
    "parent-identity", "method-stability", "exact-range",
  ],
  factsInvalidated: [],
  preserves: [
    "python-range-evaluation", "final-loop-target", "exceptions",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "nonnegative-safe-integer-count", "same-parent", "reviewed-representation",
    "prototype-and-method-identities", "canonical-values", "exact-machine-range",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: "verifyOptimizationDecision/v1",
  compilationCostBudget: 64,
  codeSizeBudget: 4096,
  requiredEvidence: [
    "enabled-disabled-differential", "guard-adversarial",
    "node-and-browser-route", "matched-representation-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const operands = recognize(context.compiler, node);
      if (!operands) return;
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(CLOSED_AFFINE_RECURRENCE_PASS, source, {
        kind: "closed-affine-recurrence",
        accumulator: operands.accumulator.name,
        multiplier: operands.multiplier.name,
        increment: operands.increment.name,
        index: operands.index.name,
        count: operands.count.name ?? operands.count.value,
        operations: ["math.ring.mul", "math.ring.add"],
      });
      const id = identity.id;
      context.consider({
        minimumLevel: "O2",
        staticRejectionReasons: ancestors.some((ancestor) =>
          ancestor instanceof context.compiler.AST_Try && ancestor.bcatch
        ) ? ["catchable-interrupt-region"] : [],
        node,
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_AFFINE_RECURRENCE_PASS,
          kind: "closed-affine-recurrence",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_AFFINE_RECURRENCE_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.for-range.closed-affine-recurrence",
            operations: ["range", "mul-dispatch", "add-dispatch", "assign"],
            observableExits: ["accumulator", "loop-index"],
            exceptionPolicy: "entry guards precede optimized effects; exact loop fallback",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.closed-affine-recurrence",
            domain: "one guarded closed parent",
            operations: ["math.ring.mul", "math.ring.add"],
            exactness: "runtime representation guard plus target exactness contract",
          },
          facts: [
            {
              kind: "no-alias",
              authority: "static",
              evidence: "loop index, accumulator, multiplier, and increment are distinct lexical bindings",
            },
            {
              kind: "no-escape",
              authority: "static",
              evidence: "the only loop statement assigns the accumulator",
            },
            {
              kind: "no-callback",
              authority: "runtime-guard",
              evidence: "captured parent, prototype, and operation method identities",
            },
            {
              kind: "parent-identity",
              authority: "runtime-guard",
              evidence: "all three operands must have one identical parent",
            },
            {
              kind: "operation-closed",
              authority: "runtime-guard",
              evidence: "parent advertises the reviewed closed arithmetic contract",
            },
            {
              kind: "exact-range",
              authority: "runtime-guard",
              evidence: "selected representation validates canonical inputs and safe intermediates",
            },
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-unboxed-affine-state",
            candidates: [
              "number-residue",
              "extension-tuple-number",
              "boxed-sage-value",
            ],
            conversions: ["unbox region inputs", "materialize accumulator at exit"],
            materializations: 1,
          },
          target: {
            level: "target",
            revision: 1,
            kind: "adaptive",
            lowering: "guarded v8 tuple or fused source-transparent isolated kernel",
            boundaryCrossings: "runtime-dependent",
            copiedBytes: "runtime-dependent",
            selectedCandidate: "runtime-adaptive",
            policy: "trip-count and authenticated isolated-target availability",
            candidates: [
              targetCandidate({
                id: "v8-number-or-tuple-affine",
                kind: "v8",
                representation: "number-residue or extension-tuple-number",
                availability: "runtime-gated",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 4,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  allocations: 1,
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: 1,
                  emittedBytes: 768,
                },
                evidence: "finite-field boundary benchmark and guarded Number exactness",
              }),
              targetCandidate({
                id: "wasm-fused-affine",
                kind: "wasm",
                representation: "packed extension-tuple-uint64",
                availability: "runtime-gated",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 2,
                  boundaryCrossings: 1,
                  copiedBytes: 16,
                  allocations: 1,
                  cleanupOperations: 1,
                  materializations: 1,
                  emittedBytes: 0,
                },
                evidence: "source-transparent packed kernel in authenticated Wasm pack",
              }),
              targetCandidate({
                id: "native-fused-affine",
                kind: "native",
                representation: "packed extension-tuple-uint64",
                availability: "runtime-gated",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 2,
                  boundaryCrossings: 1,
                  copiedBytes: 16,
                  allocations: 1,
                  cleanupOperations: 1,
                  materializations: 1,
                  emittedBytes: 0,
                },
                evidence: "source-transparent packed kernel in production native pack",
              }),
              targetCandidate({
                id: "generic-affine-fallback",
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
            "nonnegative-safe-integer-count",
            "same-parent",
            "reviewed-representation",
            "prototype-and-method-identities",
            "canonical-values",
            "exact-machine-range",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${CLOSED_AFFINE_RECURRENCE_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            "operations:math.ring.mul,math.ring.add",
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};
