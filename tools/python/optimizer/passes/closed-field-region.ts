import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";

export const CLOSED_FIELD_REGION_PASS = "math.closed-field-region.v1";

type ExpressionPlan =
  | { kind: "slot"; slot: number }
  | { kind: "sequence"; sequence: number }
  | { kind: "binary"; operator: "+" | "-" | "*"; left: ExpressionPlan; right: ExpressionPlan }
  | { kind: "neg"; value: ExpressionPlan };

type ConditionPlan = {
  kind: "equal";
  left: ExpressionPlan;
  right: ExpressionPlan;
};

type StatementPlan =
  | { kind: "assign"; target: number; value: ExpressionPlan }
  | { kind: "if"; condition: ConditionPlan; body: StatementPlan[]; alternative: StatementPlan[] };

type AffineTargetPlan = {
  accumulatorSlot: number;
  multiplierSlot: number;
  incrementSlot: number;
};

function affineTarget(
  statements: StatementPlan[],
  stateSlots: number[],
): AffineTargetPlan | null {
  if (statements.length !== 1 || stateSlots.length !== 1) return null;
  const statement = statements[0];
  if (statement.kind !== "assign" || statement.target !== stateSlots[0]) return null;
  const addition = statement.value;
  if (addition.kind !== "binary" || addition.operator !== "+" ||
      addition.right.kind !== "slot") return null;
  const multiplication = addition.left;
  if (multiplication.kind !== "binary" || multiplication.operator !== "*" ||
      multiplication.left.kind !== "slot" ||
      multiplication.right.kind !== "slot" ||
      multiplication.left.slot !== statement.target) return null;
  const slots = [
    statement.target,
    multiplication.right.slot,
    addition.right.slot,
  ];
  if (new Set(slots).size !== slots.length) return null;
  return {
    accumulatorSlot: statement.target,
    multiplierSlot: multiplication.right.slot,
    incrementSlot: addition.right.slot,
  };
}

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

/**
 * Build a small target-neutral straight-line field program.  This deliberately
 * recognizes operations and data flow, not a benchmark spelling: any bounded
 * loop made solely from closed field assignments and equality branches maps to
 * the same operation graph.
 */
function recognize(compiler: any, loop: any): null | Record<string, any> {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      loop.optimization_region) return null;

  let iteratorKind: "range" | "sequence";
  let count: any = null;
  let iterable: any = null;
  let iteratorName: string;
  if (loop.init instanceof compiler.AST_SymbolRef &&
      loop.object instanceof compiler.AST_Call &&
      loop.object.expression instanceof compiler.AST_SymbolRef &&
      loop.object.expression.name === "range" &&
      loop.builtin_range !== false && loop.object.args?.length === 1 &&
      !loop.object.args.starargs && !loop.object.args.kwargs?.length &&
      !loop.object.args.kwarg_items?.length) {
    iteratorKind = "range";
    count = loop.object.args[0];
    iteratorName = loop.init.name;
  } else if (loop.init instanceof compiler.AST_SymbolRef &&
             loop.object instanceof compiler.AST_SymbolRef) {
    iteratorKind = "sequence";
    iterable = loop.object;
    iteratorName = loop.init.name;
  } else {
    return null;
  }
  if (!(loop.body instanceof compiler.AST_BlockStatement) ||
      !loop.body.body?.length || loop.body.body.length > 32) return null;

  const slots: Array<{ name: string; node: any }> = [];
  const slotByName = new Map<string, number>();
  const sequences: Array<{ name: string; node: any }> = [];
  const sequenceByName = new Map<string, number>();
  const modified = new Set<string>();
  const read = new Set<string>();
  const operations = new Set<string>();

  const assignment = (statement: any): any | null => {
    if (!(statement instanceof compiler.AST_SimpleStatement)) return null;
    const value = statement.body;
    if (!(value instanceof compiler.AST_Assign) || value.operator !== "=" ||
        !(value.left instanceof compiler.AST_SymbolRef)) return null;
    return value;
  };
  const collectTargets = (statements: any[]): boolean => {
    for (const statement of statements) {
      const value = assignment(statement);
      if (value) {
        if (value.left.name === iteratorName) return false;
        modified.add(value.left.name);
        continue;
      }
      if (!(statement instanceof compiler.AST_If) ||
          !(statement.body instanceof compiler.AST_BlockStatement) ||
          (statement.alternative &&
           !(statement.alternative instanceof compiler.AST_BlockStatement)) ||
          !collectTargets(statement.body.body) ||
          (statement.alternative &&
           !collectTargets(statement.alternative.body))) return false;
    }
    return true;
  };
  if (!collectTargets(loop.body.body) || modified.size === 0 ||
      modified.size > 8) return null;

  const slot = (node: any, isRead: boolean): number => {
    let index = slotByName.get(node.name);
    if (index === undefined) {
      index = slots.length;
      slotByName.set(node.name, index);
      slots.push({ name: node.name, node });
    }
    if (isRead) read.add(node.name);
    return index;
  };
  const sequence = (node: any): number => {
    let index = sequenceByName.get(node.name);
    if (index === undefined) {
      index = sequences.length;
      sequenceByName.set(node.name, index);
      sequences.push({ name: node.name, node });
    }
    return index;
  };
  if (iteratorKind === "sequence") sequence(iterable);

  const expression = (node: any): ExpressionPlan | null => {
    if (node instanceof compiler.AST_SymbolRef) {
      if (iteratorKind === "sequence" && node.name === iteratorName) {
        return { kind: "sequence", sequence: 0 };
      }
      if (node.name === iteratorName) return null;
      return { kind: "slot", slot: slot(node, true) };
    }
    if (node instanceof compiler.AST_ItemAccess &&
        iteratorKind === "range" &&
        node.expression instanceof compiler.AST_SymbolRef &&
        node.property instanceof compiler.AST_SymbolRef &&
        node.property.name === iteratorName) {
      return { kind: "sequence", sequence: sequence(node.expression) };
    }
    if (node instanceof compiler.AST_Binary &&
        ["+", "-", "*"].includes(node.operator)) {
      const left = expression(node.left);
      const right = expression(node.right);
      if (!left || !right) return null;
      operations.add(node.operator === "+" ? "add" :
        node.operator === "-" ? "sub" : "mul");
      return { kind: "binary", operator: node.operator, left, right };
    }
    if (node instanceof compiler.AST_Unary && node.operator === "-") {
      const value = expression(node.expression);
      if (!value) return null;
      operations.add("neg");
      return { kind: "neg", value };
    }
    return null;
  };
  const condition = (node: any): ConditionPlan | null => {
    if (!(node instanceof compiler.AST_Binary) || node.operator !== "==") {
      return null;
    }
    const left = expression(node.left);
    const right = expression(node.right);
    if (!left || !right) return null;
    operations.add("equal");
    return { kind: "equal", left, right };
  };
  const statements = (source: any[]): StatementPlan[] | null => {
    const output: StatementPlan[] = [];
    for (const statement of source) {
      const value = assignment(statement);
      if (value) {
        const rhs = expression(value.right);
        if (!rhs) return null;
        output.push({
          kind: "assign",
          target: slot(value.left, false),
          value: rhs,
        });
        continue;
      }
      if (!(statement instanceof compiler.AST_If)) return null;
      const test = condition(statement.condition);
      const body = statements(statement.body.body);
      const alternative = statement.alternative
        ? statements(statement.alternative.body)
        : [];
      if (!test || !body || !alternative) return null;
      output.push({ kind: "if", condition: test, body, alternative });
    }
    return output;
  };
  const program = statements(loop.body.body);
  if (!program || operations.size === 0 || slots.length > 16 ||
      sequences.length > 4) return null;
  // Reading every output before its first materialization avoids introducing
  // a new entry-time NameError for assignment-only locals.
  if ([...modified].some((name) => !read.has(name))) return null;
  if ([...modified].some((name) => sequenceByName.has(name))) return null;

  const stateSlots = [...modified].map((name) => slotByName.get(name)!);
  const affine = iteratorKind === "range"
    ? affineTarget(program, stateSlots)
    : null;
  return {
    iteratorKind,
    count,
    iterable,
    iterator: loop.init,
    slots,
    sequences,
    stateSlots,
    statements: program,
    operations: [...operations].sort(),
    affine,
  };
}

export const closedFieldRegionPass: OptimizationPass = {
  id: CLOSED_FIELD_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: ["builtin-range", "lexical-binding", "structured-effects"],
  factsProduced: [
    "parent-identity", "parent-stable", "method-stability", "fixed-shape",
    "no-alias", "no-escape", "no-callback", "operation-closed", "exact-range",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "exceptions", "object-identity-on-zero-trip", "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "same-parent", "reviewed-representation",
    "prototype-and-used-method-identities", "canonical-values",
    "sequence-prefix-bounds", "exact-machine-range",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: "verifyOptimizationDecision/v1",
  compilationCostBudget: 128,
  codeSizeBudget: 16384,
  requiredEvidence: [
    "generated-enabled-disabled-differential", "held-out-source-corpus",
    "guard-and-alias-adversarial", "node-and-three-browser-route",
    "public-workload-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const operands = recognize(context.compiler, node);
      if (!operands) return;
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(CLOSED_FIELD_REGION_PASS, source, {
        kind: "closed-field-region",
        iteratorKind: operands.iteratorKind,
        slots: operands.slots.map((slot: any) => slot.name),
        sequences: operands.sequences.map((sequence: any) => sequence.name),
        stateSlots: operands.stateSlots,
        statements: operands.statements,
        operations: operands.operations,
        affine: operands.affine,
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
          passId: CLOSED_FIELD_REGION_PASS,
          kind: "closed-field-region",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_FIELD_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.closed-field-loop",
            operations: [
              "iterate", "sequential-assign", ...operands.operations.map(
                (operation: string) => `${operation}-dispatch`
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
            kind: "math.closed-field-program",
            domain: "one guarded closed finite-field parent",
            operations: operands.operations.map(
              (operation: string) => `math.field.${operation}`
            ),
            exactness: "runtime parent/shape/method guards plus exact Number range",
          },
          facts: [
            { kind: "no-alias", authority: "static", evidence: "distinct lexical state bindings" },
            { kind: "no-escape", authority: "static", evidence: "only local state assignments and control flow occur in the region" },
            { kind: "no-callback", authority: "runtime-guard", evidence: "all used operator identities match reviewed immutable finite-field methods" },
            { kind: "parent-identity", authority: "runtime-guard", evidence: "all scalar and sequence values share one parent" },
            { kind: "fixed-shape", authority: "runtime-guard", evidence: "the selected parent advertises a reviewed fixed representation" },
            { kind: "exact-range", authority: "runtime-guard", evidence: "the selected representation validates canonical values and machine intermediates" },
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-unboxed-field-program",
            candidates: ["number-residue", "extension-tuple-number", "boxed-sage-value"],
            conversions: ["unbox live-ins and sequence prefixes", "materialize modified live-outs"],
            materializations: operands.stateSlots.length,
          },
          target: {
            level: "target",
            revision: 1,
            kind: operands.affine ? "adaptive" : "v8",
            lowering: operands.affine
              ? "trip-count-gated isolated affine target or monomorphic scalar operation graph"
              : "monomorphic scalar locals generated from target-neutral field operations",
            boundaryCrossings: operands.affine ? "runtime-dependent" : 0,
            copiedBytes: "runtime-dependent",
            selectedCandidate: operands.affine
              ? "runtime-adaptive"
              : "v8-closed-field-program",
            policy: operands.affine
              ? "guarded representation, trip count, and authenticated isolated-target availability"
              : "bounded monomorphic scalar region with one entry validation",
            candidates: [
              targetCandidate({
                id: "v8-closed-field-program",
                kind: "v8",
                representation: "number-residue or extension-tuple-number",
                availability: operands.affine ? "runtime-gated" : "selected",
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
                id: "wasm-resident-field-program",
                kind: "wasm",
                representation: "packed or resident field values",
                availability: operands.affine ? "runtime-gated" : "rejected",
                rejectionReason: operands.affine
                  ? null
                  : "resident-general-region-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine
                  ? "source-transparent packed quadratic kernel in the authenticated Wasm pack"
                  : "candidate retained for the same Mathematical IR; no general resident lowering yet",
              }),
              targetCandidate({
                id: "native-isolated-field-program",
                kind: "native",
                representation: "packed fixed-shape field values",
                availability: operands.affine ? "runtime-gated" : "rejected",
                rejectionReason: operands.affine
                  ? null
                  : "general-operation-graph-native-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine
                  ? "source-transparent packed quadratic kernel in the production native pack"
                  : "isolated affine witness exists; general operation graph is not silently substituted",
              }),
              targetCandidate({
                id: "generic-field-program-fallback",
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
            "sequence-prefix-bounds", "exact-machine-range",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${CLOSED_FIELD_REGION_PASS}`,
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
