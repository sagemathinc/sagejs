import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";

export const CLOSED_RING_REGION_PASS = "math.closed-ring-region.v1";
const MAX_INLINE_POWER_EXPONENT = 8;
const MAX_OPERATION_COST = 64;

type ExpressionPlan =
  | { kind: "slot"; slot: number }
  | {
      kind: "sequence";
      sequence: number;
      indexOrder: "forward" | "reverse";
    }
  | { kind: "binary"; operator: "+" | "-" | "*"; left: ExpressionPlan; right: ExpressionPlan }
  | { kind: "neg"; value: ExpressionPlan }
  | { kind: "power"; exponent: number; value: ExpressionPlan };

type ConditionPlan = {
  kind: "equal";
  left: ExpressionPlan;
  right: ExpressionPlan;
};

type StatementPlan =
  | { kind: "assign"; target: number; value: ExpressionPlan }
  | { kind: "if"; condition: ConditionPlan; body: StatementPlan[]; alternative: StatementPlan[] };

function expressionOperationCost(value: ExpressionPlan): number {
  if (value.kind === "slot" || value.kind === "sequence") return 0;
  if (value.kind === "neg") return 1 + expressionOperationCost(value.value);
  if (value.kind === "binary") {
    return 1 + expressionOperationCost(value.left) + expressionOperationCost(value.right);
  }
  let exponent = value.exponent;
  let products = 0;
  let hasResult = false;
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      if (hasResult) products += 1;
      hasResult = true;
    }
    exponent = Math.floor(exponent / 2);
    if (exponent > 0) products += 1;
  }
  return products + expressionOperationCost(value.value);
}

function statementsOperationCost(statements: StatementPlan[]): number {
  return statements.reduce((total, statement) => {
    if (statement.kind === "assign") {
      return total + expressionOperationCost(statement.value);
    }
    return total + 1 +
      expressionOperationCost(statement.condition.left) +
      expressionOperationCost(statement.condition.right) +
      statementsOperationCost(statement.body) +
      statementsOperationCost(statement.alternative);
  }, 0);
}

type AffineTargetPlan =
  | {
      kind: "fixed-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSlot: number;
    }
  | {
      kind: "sequence-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSequence: number;
      incrementOperator: "add" | "subtract";
    };

function affineTarget(
  statements: StatementPlan[],
  stateSlots: number[],
): AffineTargetPlan | null {
  if (statements.length !== 1 || stateSlots.length !== 1) return null;
  const statement = statements[0];
  if (statement.kind !== "assign" || statement.target !== stateSlots[0]) return null;
  const combination = statement.value;
  if (combination.kind !== "binary" ||
      (combination.operator !== "+" && combination.operator !== "-")) return null;

  const multiplicationWithAccumulator = (candidate: ExpressionPlan) => {
    if (candidate.kind !== "binary" || candidate.operator !== "*" ||
        candidate.left.kind !== "slot" || candidate.right.kind !== "slot") {
      return null;
    }
    if (candidate.left.slot === statement.target &&
        candidate.right.slot !== statement.target) return candidate.right.slot;
    if (candidate.right.slot === statement.target &&
        candidate.left.slot !== statement.target) return candidate.left.slot;
    return null;
  };

  let multiplierSlot = multiplicationWithAccumulator(combination.left);
  let increment = combination.right;
  let incrementOperator: "add" | "subtract" =
    combination.operator === "+" ? "add" : "subtract";
  if (multiplierSlot === null && combination.operator === "+") {
    multiplierSlot = multiplicationWithAccumulator(combination.right);
    increment = combination.left;
    incrementOperator = "add";
  }
  if (multiplierSlot === null ||
      (increment.kind !== "slot" && increment.kind !== "sequence")) return null;
  if (increment.kind === "sequence") {
    return {
      kind: "sequence-increment",
      accumulatorSlot: statement.target,
      multiplierSlot,
      incrementSequence: increment.sequence,
      incrementOperator,
    };
  }
  // The isolated recurrence ABI currently implements `x*a+b`.  Other fixed
  // affine signs remain in the general operation graph until that ABI has an
  // explicit signed-increment contract.
  if (incrementOperator !== "add") return null;
  const slots = [statement.target, multiplierSlot, increment.slot];
  if (new Set(slots).size !== slots.length) return null;
  return {
    kind: "fixed-increment",
    accumulatorSlot: statement.target,
    multiplierSlot,
    incrementSlot: increment.slot,
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

function boundedPowerExponent(compiler: any, node: any): number | null {
  if (node instanceof compiler.AST_Number && Number.isSafeInteger(node.value) &&
      node.value >= 0 && node.value <= MAX_INLINE_POWER_EXPONENT) return node.value;
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== "Integer" || node.args?.length !== 1 ||
      node.args.starargs || node.args.kwargs?.length ||
      node.args.kwarg_items?.length ||
      !(node.args[0] instanceof compiler.AST_String)) return null;
  const spelling = node.args[0].value;
  if (!/^[0-9](?:_?[0-9])*$/.test(spelling)) return null;
  const exponent = Number(spelling.replaceAll("_", ""));
  return Number.isSafeInteger(exponent) &&
    exponent <= MAX_INLINE_POWER_EXPONENT ? exponent : null;
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
  let iterationOrder: "forward" | "reverse" = "forward";
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
  } else if (loop.init instanceof compiler.AST_SymbolRef &&
             loop.object instanceof compiler.AST_Call &&
             loop.object.direct_call === true &&
             loop.object.expression instanceof compiler.AST_SymbolRef &&
             loop.object.expression.name === "reversed" &&
             loop.object.args?.length === 1 &&
             !loop.object.args.starargs && !loop.object.args.kwargs?.length &&
             !loop.object.args.kwarg_items?.length &&
             loop.object.args[0] instanceof compiler.AST_SymbolRef) {
    iteratorKind = "sequence";
    iterable = loop.object.args[0];
    iterationOrder = "reverse";
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
        return {
          kind: "sequence",
          sequence: 0,
          indexOrder: iterationOrder,
        };
      }
      if (node.name === iteratorName) return null;
      return { kind: "slot", slot: slot(node, true) };
    }
    if (node instanceof compiler.AST_ItemAccess &&
        iteratorKind === "range" &&
        node.expression instanceof compiler.AST_SymbolRef &&
        node.property instanceof compiler.AST_SymbolRef &&
        node.property.name === iteratorName) {
      return {
        kind: "sequence",
        sequence: sequence(node.expression),
        indexOrder: "forward",
      };
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
    if (node instanceof compiler.AST_Binary && node.operator === "**") {
      const exponent = boundedPowerExponent(compiler, node.right);
      const value = expression(node.left);
      if (exponent === null || !value) return null;
      operations.add("pow");
      return { kind: "power", exponent, value };
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
  const operationCost = statementsOperationCost(program);
  if (operationCost > MAX_OPERATION_COST) return null;
  // Reading every output before its first materialization avoids introducing
  // a new entry-time NameError for assignment-only locals.
  if ([...modified].some((name) => !read.has(name))) return null;
  if ([...modified].some((name) => sequenceByName.has(name))) return null;

  const stateSlots = [...modified].map((name) => slotByName.get(name)!);
  const affine = affineTarget(program, stateSlots);
  const sequenceUses = new Array(sequences.length).fill(0);
  const sequenceAccessMap = new Map<string, {
    sequence: number;
    indexOrder: "forward" | "reverse";
    uses: number;
  }>();
  const countSequenceUses = (value: ExpressionPlan): void => {
    if (value.kind === "sequence") {
      sequenceUses[value.sequence] += 1;
      const key = `${value.sequence}:${value.indexOrder}`;
      const access = sequenceAccessMap.get(key);
      if (access) access.uses += 1;
      else sequenceAccessMap.set(key, {
        sequence: value.sequence,
        indexOrder: value.indexOrder,
        uses: 1,
      });
    } else if (value.kind === "binary") {
      countSequenceUses(value.left);
      countSequenceUses(value.right);
    } else if (value.kind === "neg" || value.kind === "power") {
      countSequenceUses(value.value);
    }
  };
  const countStatementSequenceUses = (statement: StatementPlan): void => {
    if (statement.kind === "assign") {
      countSequenceUses(statement.value);
      return;
    }
    countSequenceUses(statement.condition.left);
    countSequenceUses(statement.condition.right);
    statement.body.forEach(countStatementSequenceUses);
    statement.alternative.forEach(countStatementSequenceUses);
  };
  program.forEach(countStatementSequenceUses);
  const sequenceAccesses = [...sequenceAccessMap.values()];
  const transactionalStream =
    sequenceAccesses.length > 0 &&
    sequenceAccesses.length <= 2 &&
    sequenceUses.reduce((total, count) => total + count, 0) <= 8;
  const sequenceStrategy =
    affine?.kind === "sequence-increment" || transactionalStream
      ? "stream"
      : "pack";
  return {
    iteratorKind,
    iterationOrder,
    count,
    iterable,
    iterator: loop.init,
    slots,
    sequences,
    stateSlots,
    statements: program,
    operations: [...operations].sort(),
    affine,
    sequenceUses,
    sequenceAccesses,
    sequenceStrategy,
    operationCost,
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
    "commutative-ring",
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
      const identity = stableRegionIdentity(CLOSED_RING_REGION_PASS, source, {
        kind: "closed-ring-region",
        iteratorKind: operands.iteratorKind,
        iterationOrder: operands.iterationOrder,
        slots: operands.slots.map((slot: any) => slot.name),
        sequences: operands.sequences.map((sequence: any) => sequence.name),
        stateSlots: operands.stateSlots,
        statements: operands.statements,
        operations: operands.operations,
        affine: operands.affine,
        sequenceUses: operands.sequenceUses,
        sequenceAccesses: operands.sequenceAccesses,
        sequenceStrategy: operands.sequenceStrategy,
        operationCost: operands.operationCost,
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
          passId: CLOSED_RING_REGION_PASS,
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
            { kind: "parent-identity", authority: "runtime-guard", evidence: "all scalar and sequence values share one parent" },
            { kind: "fixed-shape", authority: "runtime-guard", evidence: "the selected parent advertises a reviewed fixed representation" },
            { kind: "exact-range", authority: "runtime-guard", evidence: "the selected representation validates canonical values and machine intermediates" },
            { kind: "commutative-ring", authority: "runtime-guard", evidence: "the selected machine parent explicitly advertises reviewed commutative multiplication" },
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
            "sequence-prefix-bounds", "exact-machine-range",
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
