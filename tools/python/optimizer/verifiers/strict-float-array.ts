import { InternalRegionPlan, OPTIMIZER_IR_SCHEMA } from "../types";

// Keep these values local: verifier trust must not inherit claims or budgets
// from the transformation-side domain and target planners.
const VERIFIED_PASS = "math.strict-float-array-region.v1";
const VERIFIED_LOWERING = "v8.strict-float-array-loop.v1";
const VERIFIED_KIND = "strict-float-array-region";
const VERIFIED_VERIFIER = "verify.strict-float-array-plan.v1";
const VERIFIED_CODE_SIZE_BUDGET = 16_384;

interface FlowFacts {
  inputSlots: number[];
  stateSlots: number[];
  localSlots: number[];
  definitelyAssigned: Set<number>;
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`strict float array ${field} must be a nonempty string`);
  }
}

function sameNumbers(left: unknown, right: readonly number[]): boolean {
  return Array.isArray(left) && left.length === right.length &&
    left.every((value, index) =>
      Number.isSafeInteger(value) && value === right[index]);
}

function collectExpression(
  expression: any,
  slotCount: number,
  sequenceOrder: "forward" | "reverse",
  reads: Set<number>,
  operations: Set<string>,
): { operationNodes: number; sequenceUses: number; containsValue: boolean } {
  if (!expression || typeof expression !== "object") {
    throw new TypeError("strict float array expression must be an object");
  }
  if (expression.kind === "slot") {
    if (!Number.isSafeInteger(expression.slot) || expression.slot < 0 ||
        expression.slot >= slotCount) {
      throw new TypeError("strict float array slot is out of range");
    }
    reads.add(expression.slot);
    return { operationNodes: 0, sequenceUses: 0, containsValue: true };
  }
  if (expression.kind === "sequence") {
    if (expression.sequence !== 0 || expression.indexOrder !== sequenceOrder) {
      throw new TypeError("strict float array sequence access is stale");
    }
    return { operationNodes: 0, sequenceUses: 1, containsValue: true };
  }
  if (expression.kind === "neg") {
    operations.add("neg");
    const child = collectExpression(
      expression.value, slotCount, sequenceOrder, reads, operations,
    );
    return { ...child, operationNodes: child.operationNodes + 1 };
  }
  if (expression.kind === "binary" &&
      ["+", "-", "*"].includes(expression.operator)) {
    operations.add(expression.operator === "+" ? "add" :
      expression.operator === "-" ? "sub" : "mul");
    const left = collectExpression(
      expression.left, slotCount, sequenceOrder, reads, operations,
    );
    const right = collectExpression(
      expression.right, slotCount, sequenceOrder, reads, operations,
    );
    return {
      operationNodes: left.operationNodes + right.operationNodes + 1,
      sequenceUses: left.sequenceUses + right.sequenceUses,
      containsValue: left.containsValue || right.containsValue,
    };
  }
  throw new TypeError(
    `strict float array expression ${expression.kind} exceeds the binary64 domain`,
  );
}

function verifyStatements(
  statements: any,
  slotCount: number,
  sequenceOrder: "forward" | "reverse",
  operations: Set<string>,
): { operationNodes: number; sequenceUses: number } {
  if (!Array.isArray(statements)) {
    throw new TypeError("strict float array statements must be an array");
  }
  let operationNodes = 0;
  let sequenceUses = 0;
  for (const statement of statements) {
    if (statement?.kind === "assign") {
      if (statement.assignmentOperator !== "=" ||
          !Number.isSafeInteger(statement.target) || statement.target < 0 ||
          statement.target >= slotCount) {
        throw new TypeError("strict float array assignment is invalid");
      }
      const value = collectExpression(
        statement.value, slotCount, sequenceOrder, new Set(), operations,
      );
      if (!value.containsValue) {
        throw new TypeError("strict float array assignment has no guarded value");
      }
      operationNodes += value.operationNodes;
      sequenceUses += value.sequenceUses;
      continue;
    }
    if (statement?.kind !== "if" ||
        statement.condition?.kind !== "comparison" ||
        !["==", "!="].includes(statement.condition.operator)) {
      throw new TypeError("strict float array statement exceeds the reviewed domain");
    }
    operations.add("equal");
    const left = collectExpression(
      statement.condition.left, slotCount, sequenceOrder, new Set(), operations,
    );
    const right = collectExpression(
      statement.condition.right, slotCount, sequenceOrder, new Set(), operations,
    );
    if (!left.containsValue && !right.containsValue) {
      throw new TypeError("strict float array comparison has no guarded value");
    }
    const body = verifyStatements(
      statement.body, slotCount, sequenceOrder, operations,
    );
    const alternative = verifyStatements(
      statement.alternative, slotCount, sequenceOrder, operations,
    );
    operationNodes += 1 + left.operationNodes + right.operationNodes +
      body.operationNodes + alternative.operationNodes;
    sequenceUses += left.sequenceUses + right.sequenceUses +
      body.sequenceUses + alternative.sequenceUses;
  }
  return { operationNodes, sequenceUses };
}

function collectReads(expression: any, reads: Set<number>): void {
  if (expression.kind === "slot") {
    reads.add(expression.slot);
  } else if (expression.kind === "binary") {
    collectReads(expression.left, reads);
    collectReads(expression.right, reads);
  } else if (expression.kind === "neg") {
    collectReads(expression.value, reads);
  }
}

function dataFlow(statements: any[], slotCount: number): FlowFacts {
  const inputs = new Set<number>();
  const modified = new Set<number>();
  const analyze = (source: any[], incoming: Set<number>): Set<number> => {
    let assigned = new Set(incoming);
    const read = (expression: any): void => {
      const slots = new Set<number>();
      collectReads(expression, slots);
      for (const slot of slots) {
        if (!assigned.has(slot)) inputs.add(slot);
      }
    };
    for (const statement of source) {
      if (statement.kind === "assign") {
        read(statement.value);
        modified.add(statement.target);
        assigned.add(statement.target);
      } else {
        read(statement.condition.left);
        read(statement.condition.right);
        const body = analyze(statement.body, assigned);
        const alternative = analyze(statement.alternative, assigned);
        assigned = new Set([...body].filter((slot) => alternative.has(slot)));
      }
    }
    return assigned;
  };
  const definitelyAssigned = analyze(statements, new Set());
  const inputSlots = [...inputs].sort((left, right) => left - right);
  const stateSlots = [...modified].sort((left, right) => left - right);
  const localSlots = Array.from({ length: slotCount }, (_value, slot) => slot)
    .filter((slot) => !inputs.has(slot));
  return { inputSlots, stateSlots, localSlots, definitelyAssigned };
}

function deadStores(
  statements: any[],
  liveOut: Set<number>,
): { statements: any[]; liveIn: Set<number>; eliminated: number } {
  let live = new Set(liveOut);
  const output: any[] = [];
  let eliminated = 0;
  for (let index = statements.length - 1; index >= 0; index -= 1) {
    const statement = statements[index];
    if (statement.kind === "assign") {
      if (!live.has(statement.target)) {
        eliminated += 1;
        continue;
      }
      live.delete(statement.target);
      collectReads(statement.value, live);
      output.unshift(statement);
      continue;
    }
    const body = deadStores(statement.body, live);
    const alternative = deadStores(statement.alternative, live);
    eliminated += body.eliminated + alternative.eliminated;
    if (body.statements.length === 0 && alternative.statements.length === 0) {
      continue;
    }
    live = new Set([...body.liveIn, ...alternative.liveIn]);
    collectReads(statement.condition.left, live);
    collectReads(statement.condition.right, live);
    output.unshift({
      ...statement,
      body: body.statements,
      alternative: alternative.statements,
    });
  }
  return { statements: output, liveIn: live, eliminated };
}

/** Recompute every safety-critical strict-array plan claim before lowering. */
export function verifyStrictFloatArrayPlan(plan: InternalRegionPlan): void {
  if (plan?.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown strict float array schema ${plan?.schema}`);
  }
  requireString(plan.id, "id");
  if (plan.passId !== VERIFIED_PASS ||
      plan.loweringId !== VERIFIED_LOWERING ||
      plan.kind !== VERIFIED_KIND) {
    throw new TypeError("strict float array plan has a mismatched stable ID");
  }
  if (plan.functionId !== null) requireString(plan.functionId, "functionId");
  if (plan.guardFailure !== "fallback" && plan.guardFailure !== "error") {
    throw new TypeError("strict float array plan has an invalid guard policy");
  }
  const operands = plan.operands;
  if (!operands || typeof operands !== "object") {
    throw new TypeError("strict float array plan has no operands");
  }
  if (operands.iteratorKind !== "sequence" ||
      (operands.iterationOrder !== "forward" &&
       operands.iterationOrder !== "reverse") ||
      !operands.iterable || typeof operands.iterable.name !== "string" ||
      !operands.iterator || typeof operands.iterator.name !== "string") {
    throw new TypeError("strict float array iterator contract is invalid");
  }
  const slots = operands.slots;
  const sequences = operands.sequences;
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > 16 ||
      slots.some((slot: any) => !slot || typeof slot.name !== "string") ||
      new Set(slots.map((slot: any) => slot.name)).size !== slots.length ||
      !Array.isArray(sequences) || sequences.length !== 1 ||
      sequences[0]?.name !== operands.iterable.name ||
      slots.some((slot: any) => slot.name === sequences[0].name)) {
    throw new TypeError("strict float array slots, source, or aliases are invalid");
  }

  const semanticOperations = new Set<string>();
  const semantic = verifyStatements(
    operands.semanticStatements,
    slots.length,
    operands.iterationOrder,
    semanticOperations,
  );
  if (semantic.sequenceUses <= 0) {
    throw new TypeError("strict float array plan does not consume its sequence");
  }
  const loweredOperations = new Set<string>();
  const lowered = verifyStatements(
    operands.statements,
    slots.length,
    operands.iterationOrder,
    loweredOperations,
  );
  const operationNames = [...semanticOperations].sort();
  if (!Array.isArray(operands.operations) ||
      JSON.stringify(operands.operations) !== JSON.stringify(operationNames)) {
    throw new TypeError("strict float array plan has stale operations");
  }

  const flow = dataFlow(operands.semanticStatements, slots.length);
  for (const [name, claimed, observed] of [
    ["input", operands.inputSlots, flow.inputSlots],
    ["state", operands.stateSlots, flow.stateSlots],
    ["local", operands.localSlots, flow.localSlots],
  ] as Array<[string, unknown, number[]]>) {
    if (!sameNumbers(claimed, observed)) {
      throw new TypeError(`strict float array plan has stale ${name} slots`);
    }
  }
  if (flow.inputSlots.length === 0 || flow.stateSlots.length === 0 ||
      flow.localSlots.some((slot) =>
        flow.stateSlots.includes(slot) && !flow.definitelyAssigned.has(slot))) {
    throw new TypeError("strict float array plan has unsafe local data flow");
  }
  const eliminated = deadStores(
    operands.semanticStatements,
    new Set(flow.stateSlots),
  );
  if (JSON.stringify(operands.statements) !==
      JSON.stringify(eliminated.statements) ||
      operands.eliminatedAssignments !== eliminated.eliminated) {
    throw new TypeError("strict float array plan has stale dead-store elimination");
  }

  if (!Array.isArray(operands.sequenceUses) ||
      operands.sequenceUses.length !== 1 ||
      operands.sequenceUses[0] !== semantic.sequenceUses ||
      !Array.isArray(operands.sequenceAccesses) ||
      operands.sequenceAccesses.length !== 1 ||
      operands.sequenceAccesses[0]?.sequence !== 0 ||
      operands.sequenceAccesses[0]?.indexOrder !== operands.iterationOrder ||
      operands.sequenceAccesses[0]?.uses !== semantic.sequenceUses) {
    throw new TypeError("strict float array plan has stale sequence-use facts");
  }

  const floatWitnesses = operands.annotatedFloatArguments;
  if (!Array.isArray(floatWitnesses) ||
      floatWitnesses.length !== flow.inputSlots.length ||
      floatWitnesses.some((witness: any, index: number) => {
        const slot = flow.inputSlots[index];
        return witness?.slot !== slot ||
          witness.argument?.name !== slots[slot].name ||
          witness.argument?.annotation?.name !== "float" ||
          witness.argument?.annotation_text !== "float";
      })) {
    throw new TypeError("strict float array plan has stale scalar annotations");
  }
  const sequenceWitness = operands.annotatedSequence;
  if (sequenceWitness?.sequence !== 0 ||
      sequenceWitness.annotation !== "tuple[float, ...]" ||
      sequenceWitness.argument?.name !== sequences[0].name ||
      sequenceWitness.argument?.annotation_text !== "tuple[float, ...]" ||
      sequenceWitness.argument?.annotation?.expression?.name !== "tuple") {
    throw new TypeError("strict float array plan has a stale sequence annotation");
  }

  const expectedBytes = 1_536 + slots.length * 64 +
    lowered.operationNodes * 128 + flow.stateSlots.length * 96;
  if (operands.targetPlanId !== "target.v8-strict-float-array.v1" ||
      operands.sourceOperationNodes !== semantic.operationNodes ||
      operands.emittedOperationNodes !== lowered.operationNodes ||
      operands.targetCodeBytes !== expectedBytes ||
      expectedBytes > VERIFIED_CODE_SIZE_BUDGET ||
      operands.validatesElementsBeforePublication !== true ||
      operands.fastMath !== false || operands.reassociation !== false ||
      operands.contraction !== false) {
    throw new TypeError("strict float array plan has stale or unsafe target facts");
  }
  if (operands.representationId !==
        "representation.binary64-immutable-tuple.v1" ||
      operands.sequenceStrategy !== "transactional-stream" ||
      operands.sequenceCount !== 1 ||
      operands.sequenceAccessCount !== semantic.sequenceUses ||
      operands.copiedBytes !== 0 ||
      operands.materializations !== flow.stateSlots.length ||
      operands.elementMaterializations !== 0 ||
      operands.aliasPolicy !== "immutable-source-no-published-writes" ||
      operands.zeroTripPolicy !== "preserve-input-and-loop-target-identity") {
    throw new TypeError("strict float array plan has stale representation facts");
  }
}

export const strictFloatArrayVerifierPlugin = Object.freeze({
  id: VERIFIED_VERIFIER,
  internalKinds: Object.freeze([VERIFIED_KIND]),
  verify: verifyStrictFloatArrayPlan,
});
