import { isCostQuantity } from "./cost-model";
import {
  CompleteTargetCost,
  InternalRegionPlan,
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationPass,
  OptimizationProgram,
  TargetCandidatePlan,
} from "./types";

const IR_LEVELS = [
  "sage-semantic", "mathematical", "representation", "target",
] as const;
const TARGET_KINDS = new Set(["v8", "wasm", "native", "library", "generic"]);
const COST_KEYS: readonly (keyof CompleteTargetCost)[] = [
  "arithmeticOperations", "representationConversions", "boundaryCrossings",
  "copiedBytes", "allocations", "cleanupOperations", "compileMilliseconds",
  "instantiateMilliseconds", "loadMilliseconds", "materializations",
  "emittedBytes", "totalUnits",
];

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`optimizer IR ${field} must be a nonempty string`);
  }
}

function requireStringArray(value: unknown, field: string, nonempty = false): string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new TypeError(`optimizer IR ${field} must be ${nonempty ? "a nonempty" : "an"} array`);
  }
  const result = value as unknown[];
  for (const item of result) requireString(item, `${field} item`);
  if (new Set(result).size !== result.length) {
    throw new TypeError(`optimizer IR ${field} contains duplicates`);
  }
  return result as string[];
}

function requireNonnegativeInteger(value: unknown, field: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`optimizer IR ${field} must be a nonnegative safe integer`);
  }
}

function verifyLevel(value: unknown, expected: string, field: string): void {
  if (value !== expected) {
    throw new TypeError(`optimizer IR ${field} must be ${expected}`);
  }
}

function verifyCost(cost: CompleteTargetCost, field: string): void {
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) {
    throw new TypeError(`optimizer IR ${field} must be a complete cost object`);
  }
  const actual = Object.keys(cost).sort();
  const expected = [...COST_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`optimizer IR ${field} does not contain every cost component`);
  }
  for (const key of COST_KEYS) {
    if (!isCostQuantity(cost[key])) {
      throw new TypeError(`optimizer IR ${field}.${key} is not a cost quantity`);
    }
  }
}

function verifyTargetCandidate(candidate: TargetCandidatePlan, field: string): void {
  requireString(candidate?.id, `${field}.id`);
  requireString(candidate?.representation, `${field}.representation`);
  requireString(candidate?.evidence, `${field}.evidence`);
  if (!TARGET_KINDS.has(candidate.kind)) {
    throw new TypeError(`optimizer IR ${field}.kind is invalid`);
  }
  if (!["selected", "available", "runtime-gated", "rejected"].includes(
    candidate.availability,
  )) {
    throw new TypeError(`optimizer IR ${field}.availability is invalid`);
  }
  if (candidate.availability === "rejected") {
    requireString(candidate.rejectionReason, `${field}.rejectionReason`);
  } else if (candidate.rejectionReason !== null) {
    throw new TypeError(`optimizer IR ${field} has a rejection reason but was not rejected`);
  }
  verifyCost(candidate.cost, `${field}.cost`);
}

function verifySource(decision: OptimizationDecision): void {
  requireString(decision.source?.filename, "source.filename");
  for (const field of ["line", "column", "endLine", "endColumn"] as const) {
    requireNonnegativeInteger(decision.source?.[field], `source.${field}`);
  }
  if (decision.source.endLine < decision.source.line ||
      (decision.source.endLine === decision.source.line &&
       decision.source.endColumn < decision.source.column)) {
    throw new TypeError(`optimizer region ${decision.id} has a reversed source range`);
  }
}

export function verifyOptimizationDecision(decision: OptimizationDecision): void {
  if (decision.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer decision schema ${decision.schema}`);
  }
  requireString(decision.id, "id");
  requireString(decision.passId, "passId");
  requireString(decision.fallbackId, "fallbackId");
  // Contradictory selection is checked first so corrupt claims never get a
  // more superficial missing-field diagnosis.
  if (decision.selected && decision.rejectionReasons.length !== 0) {
    throw new TypeError(`selected optimizer region ${decision.id} was rejected`);
  }
  if (!decision.selected && decision.rejectionReasons.length === 0) {
    throw new TypeError(`rejected optimizer region ${decision.id} has no reason`);
  }
  verifySource(decision);
  requireString(decision.semantic?.kind, "semantic.kind");
  requireString(decision.mathematical?.kind, "mathematical.kind");
  requireString(decision.representation?.kind, "representation.kind");
  requireString(decision.target?.kind, "target.kind");
  verifyLevel(decision.semantic.level, "sage-semantic", "semantic.level");
  verifyLevel(decision.mathematical.level, "mathematical", "mathematical.level");
  verifyLevel(decision.representation.level, "representation", "representation.level");
  verifyLevel(decision.target.level, "target", "target.level");
  for (const [field, revision] of [
    ["semantic.revision", decision.semantic.revision],
    ["mathematical.revision", decision.mathematical.revision],
    ["representation.revision", decision.representation.revision],
    ["target.revision", decision.target.revision],
  ] as const) {
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError(`optimizer IR ${field} must be a positive revision`);
    }
  }
  requireStringArray(decision.semantic.operations, "semantic.operations", true);
  requireStringArray(decision.semantic.observableExits, "semantic.observableExits", true);
  requireString(decision.semantic.exceptionPolicy, "semantic.exceptionPolicy");
  requireString(decision.mathematical.domain, "mathematical.domain");
  requireStringArray(decision.mathematical.operations, "mathematical.operations", true);
  requireString(decision.mathematical.exactness, "mathematical.exactness");
  requireStringArray(decision.representation.candidates, "representation.candidates", true);
  requireStringArray(decision.representation.conversions, "representation.conversions");
  requireString(decision.target.lowering, "target.lowering");
  requireString(decision.target.selectedCandidate, "target.selectedCandidate");
  requireString(decision.target.policy, "target.policy");
  requireStringArray(decision.guards, "guards", true);
  requireStringArray(decision.cacheIdentityInputs, "cacheIdentityInputs", true);
  requireStringArray(decision.rejectionReasons, "rejectionReasons");
  if (decision.fallbackId === decision.id) {
    throw new TypeError(`optimizer region ${decision.id} uses itself as fallback`);
  }
  if (!Array.isArray(decision.facts) || decision.facts.length === 0) {
    throw new TypeError(`optimizer region ${decision.id} has no facts`);
  }
  const factKinds = new Set<string>();
  for (const fact of decision.facts) {
    requireString(fact.kind, "fact.kind");
    requireString(fact.evidence, "fact.evidence");
    if (factKinds.has(fact.kind)) {
      throw new TypeError(`optimizer region ${decision.id} repeats fact ${fact.kind}`);
    }
    factKinds.add(fact.kind);
    if (!["static", "runtime-guard", "contract"].includes(fact.authority)) {
      throw new TypeError(`optimizer region ${decision.id} has invalid fact authority`);
    }
  }
  if (decision.selected && decision.target.kind === "generic") {
    throw new TypeError(`selected optimizer region ${decision.id} is generic`);
  }
  requireNonnegativeInteger(
    decision.representation.materializations,
    "representation.materializations",
  );
  for (const [field, value] of [
    ["target.boundaryCrossings", decision.target.boundaryCrossings],
    ["target.copiedBytes", decision.target.copiedBytes],
  ] as const) {
    if (value !== "runtime-dependent") requireNonnegativeInteger(value, field);
  }
  if (!Array.isArray(decision.target.candidates) ||
      decision.target.candidates.length < 2) {
    throw new TypeError(`optimizer region ${decision.id} has no target competition`);
  }
  const candidateIds = new Set<string>();
  let selectedCandidates = 0;
  let hasGeneric = false;
  let runtimeGated = 0;
  for (const candidate of decision.target.candidates) {
    verifyTargetCandidate(candidate, `target candidate ${candidate?.id ?? "<missing>"}`);
    if (candidateIds.has(candidate.id)) {
      throw new TypeError(`optimizer region ${decision.id} repeats target ${candidate.id}`);
    }
    candidateIds.add(candidate.id);
    if (candidate.availability === "selected") selectedCandidates += 1;
    if (candidate.availability === "runtime-gated") runtimeGated += 1;
    if (candidate.kind === "generic" && candidate.availability !== "rejected") {
      hasGeneric = true;
    }
  }
  if (!hasGeneric) {
    throw new TypeError(`optimizer region ${decision.id} has no available generic fallback`);
  }
  if (decision.target.kind === "adaptive") {
    if (decision.target.selectedCandidate !== "runtime-adaptive" || runtimeGated < 2 ||
        selectedCandidates !== 0) {
      throw new TypeError(`optimizer region ${decision.id} has invalid adaptive targets`);
    }
  } else if (!candidateIds.has(decision.target.selectedCandidate) ||
             selectedCandidates !== 1 ||
             decision.target.candidates.find((candidate) =>
               candidate.id === decision.target.selectedCandidate
             )?.availability !== "selected") {
    throw new TypeError(`optimizer region ${decision.id} has an invalid selected target`);
  }
}

function verifyExpression(
  expression: any,
  slotCount: number,
  sequenceCount: number,
  sequenceAccesses: Map<string, number>,
): void {
  if (!expression || typeof expression !== "object") {
    throw new TypeError("optimizer internal expression must be an object");
  }
  if (expression.kind === "slot") {
    if (!Number.isSafeInteger(expression.slot) || expression.slot < 0 ||
        expression.slot >= slotCount) throw new TypeError("optimizer slot is out of range");
    return;
  }
  if (expression.kind === "sequence") {
    if (!Number.isSafeInteger(expression.sequence) || expression.sequence < 0 ||
        expression.sequence >= sequenceCount) {
      throw new TypeError("optimizer sequence is out of range");
    }
    if (expression.indexOrder !== "forward" &&
        expression.indexOrder !== "reverse") {
      throw new TypeError("optimizer sequence index order is invalid");
    }
    const key = `${expression.sequence}:${expression.indexOrder}`;
    sequenceAccesses.set(key, (sequenceAccesses.get(key) ?? 0) + 1);
    return;
  }
  if (expression.kind === "integer-constant") {
    if (!Number.isSafeInteger(expression.value)) {
      throw new TypeError("optimizer integer constant is not exact machine input");
    }
    return;
  }
  if (expression.kind === "neg") {
    verifyExpression(expression.value, slotCount, sequenceCount, sequenceAccesses);
    return;
  }
  // The numeric exponent is not itself a code-size bound: binary
  // exponentiation makes values such as 65537 cheap.  The independently
  // recomputed operation-cost ceiling below is the actual bounded-code proof.
  if (expression.kind === "power" &&
      Number.isSafeInteger(expression.exponent) &&
      expression.exponent >= 0) {
    verifyExpression(expression.value, slotCount, sequenceCount, sequenceAccesses);
    return;
  }
  if (expression.kind === "binary" && ["+", "-", "*"].includes(expression.operator)) {
    verifyExpression(expression.left, slotCount, sequenceCount, sequenceAccesses);
    verifyExpression(expression.right, slotCount, sequenceCount, sequenceAccesses);
    return;
  }
  throw new TypeError(`optimizer target-independent expression ${expression.kind} is unhandled`);
}

function expressionContainsRingValue(expression: any): boolean {
  if (expression.kind === "slot" || expression.kind === "sequence") return true;
  if (expression.kind === "integer-constant") return false;
  if (expression.kind === "neg" || expression.kind === "power") {
    return expressionContainsRingValue(expression.value);
  }
  return expressionContainsRingValue(expression.left) ||
    expressionContainsRingValue(expression.right);
}

function verifyStatements(
  statements: any,
  slotCount: number,
  sequenceCount: number,
  sequenceAccesses: Map<string, number>,
  inplaceOperations: Set<string>,
): void {
  if (!Array.isArray(statements)) throw new TypeError("optimizer statements must be an array");
  for (const statement of statements) {
    if (statement?.kind === "assign") {
      if (!Number.isSafeInteger(statement.target) || statement.target < 0 ||
          statement.target >= slotCount) throw new TypeError("optimizer assignment target is out of range");
      const assignmentOperator = statement.assignmentOperator ?? "=";
      if (!["=", "+=", "-=", "*="].includes(assignmentOperator)) {
        throw new TypeError("optimizer assignment operator is unhandled");
      }
      if (assignmentOperator !== "=") {
        const operator = assignmentOperator[0];
        const operation = operator === "+" ? "add" :
          operator === "-" ? "sub" : "mul";
        if (statement.value?.kind !== "binary" ||
            statement.value.operator !== operator ||
            statement.value.left?.kind !== "slot" ||
            statement.value.left.slot !== statement.target) {
          throw new TypeError("optimizer augmented assignment has stale normalization");
        }
        inplaceOperations.add(operation);
      }
      verifyExpression(statement.value, slotCount, sequenceCount, sequenceAccesses);
      if (!expressionContainsRingValue(statement.value)) {
        throw new TypeError("optimizer assignment loses its guarded ring parent");
      }
    } else if (statement?.kind === "if") {
      if (statement.condition?.kind !== "comparison" ||
          (statement.condition.operator !== "==" &&
           statement.condition.operator !== "!=")) {
        throw new TypeError("optimizer condition is unhandled");
      }
      verifyExpression(statement.condition.left, slotCount, sequenceCount, sequenceAccesses);
      verifyExpression(statement.condition.right, slotCount, sequenceCount, sequenceAccesses);
      if (!expressionContainsRingValue(statement.condition.left) &&
          !expressionContainsRingValue(statement.condition.right)) {
        throw new TypeError("optimizer comparison has no guarded ring value");
      }
      verifyStatements(
        statement.body, slotCount, sequenceCount, sequenceAccesses,
        inplaceOperations,
      );
      verifyStatements(
        statement.alternative, slotCount, sequenceCount, sequenceAccesses,
        inplaceOperations,
      );
    } else {
      throw new TypeError(`optimizer target-independent statement ${statement?.kind} is unhandled`);
    }
  }
}

function expressionStructuralKey(expression: any, versions?: number[]): string {
  if (expression.kind === "slot") {
    return `slot:${expression.slot}@${versions?.[expression.slot] ?? 0}`;
  }
  if (expression.kind === "sequence") {
    return `sequence:${expression.sequence}:${expression.indexOrder}`;
  }
  if (expression.kind === "integer-constant") {
    return `integer:${expression.value}`;
  }
  if (expression.kind === "neg") {
    return `neg(${expressionStructuralKey(expression.value, versions)})`;
  }
  if (expression.kind === "power") {
    return `power:${expression.exponent}(${expressionStructuralKey(expression.value, versions)})`;
  }
  if (expression.operator === "+" || expression.operator === "*") {
    const operands: string[] = [];
    const collect = (operand: any): void => {
      if (operand.kind === "binary" && operand.operator === expression.operator) {
        collect(operand.left);
        collect(operand.right);
      } else {
        operands.push(expressionStructuralKey(operand, versions));
      }
    };
    collect(expression.left);
    collect(expression.right);
    operands.sort();
    return `associative:${expression.operator}(${operands.join(",")})`;
  }
  const left = expressionStructuralKey(expression.left, versions);
  const right = expressionStructuralKey(expression.right, versions);
  return `binary:${expression.operator}(${left},${right})`;
}

function collectExpressionSlots(expression: any, slots: Set<number>): void {
  if (expression.kind === "slot") {
    slots.add(expression.slot);
  } else if (expression.kind === "binary") {
    collectExpressionSlots(expression.left, slots);
    collectExpressionSlots(expression.right, slots);
  } else if (expression.kind === "neg" || expression.kind === "power") {
    collectExpressionSlots(expression.value, slots);
  }
}

function statementDataFlow(statements: any[], slotCount: number): {
  inputSlots: number[];
  stateSlots: number[];
  localSlots: number[];
  definitelyAssigned: Set<number>;
} {
  const inputs = new Set<number>();
  const modified = new Set<number>();
  const analyze = (source: any[], incoming: Set<number>): Set<number> => {
    let assigned = new Set(incoming);
    const readExpression = (expression: any): void => {
      const reads = new Set<number>();
      collectExpressionSlots(expression, reads);
      for (const slot of reads) {
        if (!assigned.has(slot)) inputs.add(slot);
      }
    };
    for (const statement of source) {
      if (statement.kind === "assign") {
        readExpression(statement.value);
        modified.add(statement.target);
        assigned.add(statement.target);
        continue;
      }
      readExpression(statement.condition.left);
      readExpression(statement.condition.right);
      const body = analyze(statement.body, assigned);
      const alternative = analyze(statement.alternative, assigned);
      assigned = new Set([...body].filter((slot) => alternative.has(slot)));
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

function eliminateDeadStores(
  statements: any[],
  liveOut: Set<number>,
): { statements: any[]; liveIn: Set<number>; eliminatedAssignments: number } {
  let live = new Set(liveOut);
  const output: any[] = [];
  let eliminatedAssignments = 0;
  for (let index = statements.length - 1; index >= 0; index -= 1) {
    const statement = statements[index];
    if (statement.kind === "assign") {
      if (!live.has(statement.target)) {
        eliminatedAssignments += 1;
        continue;
      }
      live.delete(statement.target);
      collectExpressionSlots(statement.value, live);
      output.unshift(statement);
      continue;
    }
    const body = eliminateDeadStores(statement.body, live);
    const alternative = eliminateDeadStores(statement.alternative, live);
    eliminatedAssignments += body.eliminatedAssignments +
      alternative.eliminatedAssignments;
    if (body.statements.length === 0 && alternative.statements.length === 0) {
      continue;
    }
    live = new Set([...body.liveIn, ...alternative.liveIn]);
    collectExpressionSlots(statement.condition.left, live);
    collectExpressionSlots(statement.condition.right, live);
    output.unshift({
      ...statement,
      body: body.statements,
      alternative: alternative.statements,
    });
  }
  return { statements: output, liveIn: live, eliminatedAssignments };
}

function expressionOperations(expression: any, operations: Set<string>): void {
  if (expression.kind === "slot" || expression.kind === "sequence") return;
  if (expression.kind === "integer-constant") {
    operations.add("coerce-integer");
    return;
  }
  if (expression.kind === "neg") {
    operations.add("neg");
    expressionOperations(expression.value, operations);
    return;
  }
  if (expression.kind === "power") {
    operations.add("pow");
    expressionOperations(expression.value, operations);
    return;
  }
  operations.add(
    expression.operator === "+" ? "add" :
      expression.operator === "-" ? "sub" : "mul",
  );
  expressionOperations(expression.left, operations);
  expressionOperations(expression.right, operations);
}

function statementOperations(statements: any[], operations: Set<string>): void {
  for (const statement of statements) {
    if (statement.kind === "assign") {
      expressionOperations(statement.value, operations);
      continue;
    }
    operations.add("equal");
    expressionOperations(statement.condition.left, operations);
    expressionOperations(statement.condition.right, operations);
    statementOperations(statement.body, operations);
    statementOperations(statement.alternative, operations);
  }
}

function statementIntegerConstants(statements: any[]): number[] {
  const constants = new Set<number>();
  const collectExpression = (expression: any): void => {
    if (expression.kind === "integer-constant") {
      constants.add(expression.value);
    } else if (expression.kind === "binary") {
      collectExpression(expression.left);
      collectExpression(expression.right);
    } else if (expression.kind === "neg" || expression.kind === "power") {
      collectExpression(expression.value);
    }
  };
  const collectStatement = (statement: any): void => {
    if (statement.kind === "assign") {
      collectExpression(statement.value);
      return;
    }
    collectExpression(statement.condition.left);
    collectExpression(statement.condition.right);
    statement.body.forEach(collectStatement);
    statement.alternative.forEach(collectStatement);
  };
  statements.forEach(collectStatement);
  return [...constants].sort((left, right) => left - right);
}

function expressionOperationCost(
  expression: any,
  common: Set<string>,
  versions: number[],
): number {
  if (expression.kind === "slot" || expression.kind === "sequence" ||
      expression.kind === "integer-constant") return 0;
  const key = expressionStructuralKey(expression, versions);
  if (common.has(key)) return 0;
  common.add(key);
  if (expression.kind === "neg") {
    return 1 + expressionOperationCost(expression.value, common, versions);
  }
  if (expression.kind === "binary") {
    return 1 + expressionOperationCost(expression.left, common, versions) +
      expressionOperationCost(expression.right, common, versions);
  }
  let exponent = expression.exponent;
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
  return products + expressionOperationCost(expression.value, common, versions);
}

function statementsOperationCost(
  statements: any[],
  slotCount: number,
  versions = new Array(slotCount).fill(0),
  common = new Set<string>(),
  persistent = new Set<string>(),
): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionOperationCost(statement.value, common, versions);
      versions[statement.target] += 1;
      continue;
    }
    total += 1 + expressionOperationCost(
      statement.condition.left, common, versions,
    ) + expressionOperationCost(statement.condition.right, common, versions);
    const bodyVersions = [...versions];
    const alternativeVersions = [...versions];
    total += statementsOperationCost(
      statement.body, slotCount, bodyVersions, new Set(common), persistent,
    );
    total += statementsOperationCost(
      statement.alternative, slotCount, alternativeVersions, new Set(common), persistent,
    );
    for (let slot = 0; slot < slotCount; slot += 1) {
      versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
    }
    common.clear();
    for (const key of persistent) common.add(key);
  }
  return total;
}

function expressionIsInvariant(
  expression: any,
  invariantSlots: Set<number>,
): boolean {
  if (expression.kind === "slot") return invariantSlots.has(expression.slot);
  if (expression.kind === "sequence") return false;
  if (expression.kind === "integer-constant") return true;
  if (expression.kind === "neg" || expression.kind === "power") {
    return expressionIsInvariant(expression.value, invariantSlots);
  }
  return expressionIsInvariant(expression.left, invariantSlots) &&
    expressionIsInvariant(expression.right, invariantSlots);
}

function hoistedExpressions(
  statements: any[],
  invariantSlots: Set<number>,
  slotCount: number,
): any[] {
  const answer: any[] = [];
  const seen = new Set<string>();
  const persistent = new Set<string>();
  const markExpression = (
    expression: any,
    target: Set<string>,
    versions: number[],
  ): void => {
    if (expression.kind === "slot" || expression.kind === "sequence") return;
    const key = expressionStructuralKey(expression, versions);
    if (target.has(key)) return;
    target.add(key);
    if (expression.kind === "binary") {
      markExpression(expression.left, target, versions);
      markExpression(expression.right, target, versions);
    } else if (expression.kind !== "integer-constant") {
      markExpression(expression.value, target, versions);
    }
  };
  const visitExpression = (
    expression: any,
    common: Set<string>,
    versions: number[],
  ): void => {
    if (expression.kind === "slot" || expression.kind === "sequence") return;
    const key = expressionStructuralKey(expression, versions);
    if (common.has(key)) return;
    common.add(key);
    if (expressionIsInvariant(expression, invariantSlots)) {
      if (!seen.has(key)) {
        seen.add(key);
        answer.push(expression);
      }
      markExpression(expression, persistent, versions);
      for (const persistentKey of persistent) common.add(persistentKey);
      return;
    }
    if (expression.kind === "binary") {
      visitExpression(expression.left, common, versions);
      visitExpression(expression.right, common, versions);
    } else if (expression.kind !== "integer-constant") {
      visitExpression(expression.value, common, versions);
    }
  };
  const visitStatements = (
    source: any[],
    versions: number[],
    common: Set<string>,
  ): void => {
    for (const statement of source) {
      if (statement.kind === "assign") {
        visitExpression(statement.value, common, versions);
        versions[statement.target] += 1;
        continue;
      }
      visitExpression(statement.condition.left, common, versions);
      visitExpression(statement.condition.right, common, versions);
      const bodyVersions = [...versions];
      const alternativeVersions = [...versions];
      visitStatements(statement.body, bodyVersions, new Set(common));
      visitStatements(statement.alternative, alternativeVersions, new Set(common));
      for (let slot = 0; slot < slotCount; slot += 1) {
        versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
      }
      common.clear();
      for (const key of persistent) common.add(key);
    }
  };
  visitStatements(
    statements, new Array(slotCount).fill(0), new Set<string>(),
  );
  return answer;
}

function powerProductCount(exponent: number): number {
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
  return products;
}

function expressionTargetCodeUnits(
  expression: any,
  common: Set<string>,
  versions: number[],
): number {
  if (expression.kind === "slot" || expression.kind === "sequence" ||
      expression.kind === "integer-constant") return 0;
  const key = expressionStructuralKey(expression, versions);
  if (common.has(key)) return 0;
  common.add(key);
  if (expression.kind === "neg") {
    return 4 + expressionTargetCodeUnits(expression.value, common, versions);
  }
  if (expression.kind === "binary") {
    return (expression.operator === "*" ? 32 : 4) +
      expressionTargetCodeUnits(expression.left, common, versions) +
      expressionTargetCodeUnits(expression.right, common, versions);
  }
  const products = powerProductCount(expression.exponent);
  return (products > 1 ? 8 : 32 * products) +
    expressionTargetCodeUnits(expression.value, common, versions);
}

function statementsTargetCodeUnits(
  statements: any[],
  slotCount: number,
  versions = new Array(slotCount).fill(0),
  common = new Set<string>(),
  persistent = new Set<string>(),
): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionTargetCodeUnits(statement.value, common, versions);
      versions[statement.target] += 1;
      continue;
    }
    total += 4 + expressionTargetCodeUnits(
      statement.condition.left, common, versions,
    ) + expressionTargetCodeUnits(statement.condition.right, common, versions);
    const bodyVersions = [...versions];
    const alternativeVersions = [...versions];
    total += statementsTargetCodeUnits(
      statement.body, slotCount, bodyVersions, new Set(common), persistent,
    );
    total += statementsTargetCodeUnits(
      statement.alternative, slotCount, alternativeVersions, new Set(common), persistent,
    );
    for (let slot = 0; slot < slotCount; slot += 1) {
      versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
    }
    common.clear();
    for (const key of persistent) common.add(key);
  }
  return total;
}

function estimatedTargetCodeBytes(
  statements: any[],
  slotCount: number,
  hoisted: any[] = [],
): number {
  const common = new Set<string>();
  const versions = new Array(slotCount).fill(0);
  let units = 0;
  for (const expression of hoisted) {
    units += expressionTargetCodeUnits(expression, common, versions);
  }
  units += statementsTargetCodeUnits(
    statements,
    slotCount,
    versions,
    new Set(common),
    new Set(common),
  );
  return 1024 + 128 * units;
}

export function verifyInternalRegionPlan(plan: InternalRegionPlan): void {
  if (plan?.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer internal schema ${plan?.schema}`);
  }
  requireString(plan.id, "internal.id");
  requireString(plan.passId, "internal.passId");
  requireString(plan.kind, "internal.kind");
  if (!plan.operands || typeof plan.operands !== "object") {
    throw new TypeError(`optimizer region ${plan.id} has no operands`);
  }
  if (plan.kind === "closed-ring-region" || plan.kind === "strict-float-region") {
    const strictFloat = plan.kind === "strict-float-region";
    const slots = plan.operands.slots;
    const sequences = plan.operands.sequences;
    if (!Array.isArray(slots) || slots.length === 0 || !Array.isArray(sequences)) {
      throw new TypeError("optimizer ring region has invalid slots or sequences");
    }
    if (plan.operands.iterationOrder !== "forward" &&
        plan.operands.iterationOrder !== "reverse") {
      throw new TypeError("optimizer ring region has invalid iteration order");
    }
    if (plan.operands.iteratorKind !== "sequence" &&
        plan.operands.iterationOrder !== "forward") {
      throw new TypeError("optimizer non-sequence region reverses iteration");
    }
    if (plan.operands.iteratorKind !== "range" &&
        plan.operands.iteratorKind !== "sequence" &&
        plan.operands.iteratorKind !== "zip") {
      throw new TypeError("optimizer ring region has invalid iterator kind");
    }
    if (plan.operands.iteratorKind === "zip" &&
        typeof plan.operands.zipStrict !== "boolean") {
      throw new TypeError("optimizer ring region has invalid zip strictness");
    }
    if (plan.operands.iteratorKind === "zip") {
      const iterables = plan.operands.zipIterables;
      const targets = plan.operands.zipTargets;
      const bindings = plan.operands.zipSequenceBindings;
      if (!Array.isArray(iterables) || !Array.isArray(targets) ||
          !Array.isArray(bindings) ||
          iterables.length < 2 || iterables.length > 4 ||
          targets.length !== iterables.length ||
          bindings.length !== iterables.length ||
          iterables.some((source: any) =>
            !source || typeof source.name !== "string") ||
          targets.some((target: any) =>
            !target || typeof target.name !== "string") ||
          new Set(targets.map((target: any) => target.name)).size !== targets.length) {
        throw new TypeError("optimizer zip region has invalid bindings");
      }
      if (iterables.some((source: any, index: number) => {
        const sequence = bindings[index];
        return !Number.isSafeInteger(sequence) || sequence < 0 ||
          sequence >= sequences.length || sequences[sequence]?.name !== source.name;
      })) {
        throw new TypeError("optimizer zip region has stale sequence bindings");
      }
    }
    const semanticStatements = plan.operands.semanticStatements;
    const semanticSequenceAccesses = new Map<string, number>();
    const observedInplaceOperations = new Set<string>();
    verifyStatements(
      semanticStatements,
      slots.length,
      sequences.length,
      semanticSequenceAccesses,
      observedInplaceOperations,
    );
    const observedSequenceAccesses = new Map<string, number>();
    const loweredInplaceOperations = new Set<string>();
    verifyStatements(
      plan.operands.statements,
      slots.length,
      sequences.length,
      observedSequenceAccesses,
      loweredInplaceOperations,
    );
    const observedOperations = new Set<string>();
    statementOperations(semanticStatements, observedOperations);
    const claimedOperations = plan.operands.operations;
    if (!Array.isArray(claimedOperations) ||
        claimedOperations.length !== observedOperations.size ||
        claimedOperations.some((operation: unknown) =>
          typeof operation !== "string" || !observedOperations.has(operation)) ||
        JSON.stringify(claimedOperations) !==
          JSON.stringify([...observedOperations].sort())) {
      throw new TypeError("optimizer ring region has stale operations");
    }
    const observedIntegerConstants = statementIntegerConstants(semanticStatements);
    if (!Array.isArray(plan.operands.integerConstants) ||
        plan.operands.integerConstants.length !== observedIntegerConstants.length ||
        plan.operands.integerConstants.some((value: unknown, index: number) =>
          !Number.isSafeInteger(value) || value !== observedIntegerConstants[index])) {
      throw new TypeError("optimizer ring region has stale integer constants");
    }
    const claimedInplaceOperations = plan.operands.inplaceOperations ?? [];
    if (!Array.isArray(claimedInplaceOperations) ||
        claimedInplaceOperations.some((operation: unknown) =>
          operation !== "add" && operation !== "sub" && operation !== "mul") ||
        new Set(claimedInplaceOperations).size !== claimedInplaceOperations.length ||
        claimedInplaceOperations.length !== observedInplaceOperations.size ||
        claimedInplaceOperations.some((operation: string) =>
          !observedInplaceOperations.has(operation))) {
      throw new TypeError("optimizer ring region has stale inplace operations");
    }
    const dataFlow = statementDataFlow(semanticStatements, slots.length);
    for (const [name, claimed, observed] of [
      ["input", plan.operands.inputSlots, dataFlow.inputSlots],
      ["state", plan.operands.stateSlots, dataFlow.stateSlots],
      ["local", plan.operands.localSlots, dataFlow.localSlots],
    ] as Array<[string, unknown, number[]]>) {
      if (!Array.isArray(claimed) || claimed.length !== observed.length ||
          claimed.some((slot: unknown, index: number) =>
            !Number.isSafeInteger(slot) || slot !== observed[index])) {
        throw new TypeError(`optimizer ring region has stale ${name} slots`);
      }
    }
    if (dataFlow.inputSlots.length === 0 || dataFlow.localSlots.some((slot) =>
      dataFlow.stateSlots.includes(slot) &&
      !dataFlow.definitelyAssigned.has(slot))) {
      throw new TypeError("optimizer ring region has unsafe local data flow");
    }
    const deadStores = eliminateDeadStores(
      semanticStatements, new Set(dataFlow.stateSlots),
    );
    if (JSON.stringify(plan.operands.statements) !==
        JSON.stringify(deadStores.statements)) {
      throw new TypeError("optimizer ring region has stale dead-store elimination");
    }
    if (!Number.isSafeInteger(plan.operands.eliminatedAssignments) ||
        plan.operands.eliminatedAssignments !== deadStores.eliminatedAssignments) {
      throw new TypeError("optimizer ring region has a stale eliminated-assignment count");
    }
    const invariantSlots = new Set(
      dataFlow.inputSlots.filter((slot) => !dataFlow.stateSlots.includes(slot)),
    );
    const observedHoisted = hoistedExpressions(
      plan.operands.statements, invariantSlots, slots.length,
    );
    if (!Array.isArray(plan.operands.hoistedExpressions) ||
        JSON.stringify(plan.operands.hoistedExpressions) !==
          JSON.stringify(observedHoisted)) {
      throw new TypeError("optimizer ring region has stale hoisted expressions");
    }
    const available = new Set<string>();
    const versions = new Array(slots.length).fill(0);
    let observedPreheaderOperationCost = 0;
    for (const expression of observedHoisted) {
      observedPreheaderOperationCost += expressionOperationCost(
        expression, available, versions,
      );
    }
    const observedOperationCost = statementsOperationCost(
      plan.operands.statements,
      slots.length,
      versions,
      new Set(available),
      new Set(available),
    );
    if (!Number.isSafeInteger(plan.operands.preheaderOperationCost) ||
        plan.operands.preheaderOperationCost !== observedPreheaderOperationCost) {
      throw new TypeError("optimizer ring region has a stale preheader operation cost");
    }
    if (!Number.isSafeInteger(plan.operands.operationCost) ||
        plan.operands.operationCost !== observedOperationCost ||
        observedPreheaderOperationCost + observedOperationCost > 64) {
      throw new TypeError("optimizer ring region has a stale or excessive operation cost");
    }
    const observedTargetCodeBytes = estimatedTargetCodeBytes(
      plan.operands.statements,
      slots.length,
      observedHoisted,
    );
    if (!Number.isSafeInteger(plan.operands.targetCodeBytes) ||
        plan.operands.targetCodeBytes !== observedTargetCodeBytes ||
        observedTargetCodeBytes > 32768) {
      throw new TypeError(
        "optimizer ring region has a stale or excessive target code size",
      );
    }
    const affine = plan.operands.affine;
    if (observedInplaceOperations.size > 0 && affine !== null &&
        affine !== undefined) {
      throw new TypeError("optimizer augmented region has an unsafe affine target");
    }
    if (affine !== null && affine !== undefined) {
      if (affine.kind !== "fixed-increment" &&
          affine.kind !== "sequence-increment") {
        throw new TypeError("optimizer affine target has an invalid kind");
      }
      const indices = [affine.accumulatorSlot, affine.multiplierSlot];
      if (affine.kind === "fixed-increment") indices.push(affine.incrementSlot);
      for (const slot of indices) {
        if (!Number.isSafeInteger(slot) || slot < 0 || slot >= slots.length) {
          throw new TypeError("optimizer affine target slot is out of range");
        }
      }
      if (new Set(indices).size !== indices.length ||
          !(plan.operands.stateSlots ?? []).includes(affine.accumulatorSlot)) {
        throw new TypeError("optimizer affine target has invalid data flow");
      }
      if (affine.kind === "sequence-increment" &&
          (!Number.isSafeInteger(affine.incrementSequence) ||
           affine.incrementSequence < 0 ||
           affine.incrementSequence >= sequences.length)) {
        throw new TypeError("optimizer affine target sequence is out of range");
      }
      if (affine.kind === "sequence-increment" &&
          affine.incrementOperator !== "add" &&
          affine.incrementOperator !== "subtract") {
        throw new TypeError("optimizer affine target has an invalid increment sign");
      }
    }
    if (plan.operands.sequenceStrategy !== "pack" &&
        plan.operands.sequenceStrategy !== "stream") {
      throw new TypeError("optimizer ring region has an invalid sequence strategy");
    }
    if (plan.operands.sequenceStrategy === "stream" && sequences.length === 0) {
      throw new TypeError("optimizer ring region streams without a sequence");
    }
    if (!Array.isArray(plan.operands.sequenceUses) ||
        plan.operands.sequenceUses.length !== sequences.length ||
        plan.operands.sequenceUses.some((count: unknown) =>
          !Number.isSafeInteger(count) || Number(count) < 0)) {
      throw new TypeError("optimizer ring region has invalid sequence-use counts");
    }
    const observedSequenceUses = new Array(sequences.length).fill(0);
    for (const [key, uses] of semanticSequenceAccesses) {
      observedSequenceUses[Number(key.split(":", 1)[0])] += uses;
    }
    if (observedSequenceUses.some((uses, index) =>
      uses !== plan.operands.sequenceUses[index])) {
      throw new TypeError("optimizer ring region has stale sequence-use counts");
    }
    if (!Array.isArray(plan.operands.sequenceAccesses)) {
      throw new TypeError("optimizer ring region has invalid sequence accesses");
    }
    const claimedSequenceAccesses = new Map<string, number>();
    for (const access of plan.operands.sequenceAccesses) {
      if (!Number.isSafeInteger(access?.sequence) || access.sequence < 0 ||
          access.sequence >= sequences.length ||
          (access.indexOrder !== "forward" && access.indexOrder !== "reverse") ||
          !Number.isSafeInteger(access.uses) || access.uses <= 0) {
        throw new TypeError("optimizer ring region has an invalid sequence access");
      }
      const key = `${access.sequence}:${access.indexOrder}`;
      if (claimedSequenceAccesses.has(key)) {
        throw new TypeError("optimizer ring region repeats a sequence access");
      }
      claimedSequenceAccesses.set(key, access.uses);
    }
    if (claimedSequenceAccesses.size !== semanticSequenceAccesses.size ||
        [...semanticSequenceAccesses].some(([key, uses]) =>
          claimedSequenceAccesses.get(key) !== uses)) {
      throw new TypeError("optimizer ring region has stale sequence accesses");
    }
    if (!Array.isArray(plan.operands.loweredSequenceUses) ||
        plan.operands.loweredSequenceUses.length !== sequences.length ||
        plan.operands.loweredSequenceUses.some((count: unknown) =>
          !Number.isSafeInteger(count) || Number(count) < 0)) {
      throw new TypeError(
        "optimizer ring region has invalid lowered sequence-use counts",
      );
    }
    const observedLoweredSequenceUses = new Array(sequences.length).fill(0);
    for (const [key, uses] of observedSequenceAccesses) {
      observedLoweredSequenceUses[Number(key.split(":", 1)[0])] += uses;
    }
    if (observedLoweredSequenceUses.some((uses, index) =>
      uses !== plan.operands.loweredSequenceUses[index])) {
      throw new TypeError(
        "optimizer ring region has stale lowered sequence-use counts",
      );
    }
    if (!Array.isArray(plan.operands.loweredSequenceAccesses)) {
      throw new TypeError(
        "optimizer ring region has invalid lowered sequence accesses",
      );
    }
    const claimedLoweredSequenceAccesses = new Map<string, number>();
    for (const access of plan.operands.loweredSequenceAccesses) {
      if (!Number.isSafeInteger(access?.sequence) || access.sequence < 0 ||
          access.sequence >= sequences.length ||
          (access.indexOrder !== "forward" && access.indexOrder !== "reverse") ||
          !Number.isSafeInteger(access.uses) || access.uses <= 0) {
        throw new TypeError(
          "optimizer ring region has an invalid lowered sequence access",
        );
      }
      const key = `${access.sequence}:${access.indexOrder}`;
      if (claimedLoweredSequenceAccesses.has(key)) {
        throw new TypeError(
          "optimizer ring region repeats a lowered sequence access",
        );
      }
      claimedLoweredSequenceAccesses.set(key, access.uses);
    }
    if (claimedLoweredSequenceAccesses.size !== observedSequenceAccesses.size ||
        [...observedSequenceAccesses].some(([key, uses]) =>
          claimedLoweredSequenceAccesses.get(key) !== uses)) {
      throw new TypeError(
        "optimizer ring region has stale lowered sequence accesses",
      );
    }
    const expectedSequenceStrategy =
      affine?.kind === "sequence-increment" ||
      (semanticSequenceAccesses.size > 0 &&
       semanticSequenceAccesses.size <= 2 &&
       [...observedSequenceAccesses.values()].reduce(
         (total, uses) => total + uses, 0
       ) <= 8)
        ? "stream"
        : "pack";
    if (plan.operands.sequenceStrategy !== expectedSequenceStrategy) {
      throw new TypeError("optimizer ring region has a stale sequence strategy");
    }
    if (strictFloat) {
      if (plan.passId !== "math.strict-float-region.v1" ||
          plan.operands.iteratorKind !== "range" || sequences.length !== 0 ||
          plan.operands.integerConstants.length !== 0 ||
          claimedInplaceOperations.length !== 0 ||
          claimedOperations.some((operation: string) =>
            operation !== "add" && operation !== "sub" &&
            operation !== "mul" && operation !== "neg" &&
            operation !== "equal")) {
        throw new TypeError("optimizer strict-float region exceeds its operation domain");
      }
      const annotations = plan.operands.annotatedFloatArguments;
      if (!Array.isArray(annotations) ||
          annotations.length !== dataFlow.inputSlots.length ||
          annotations.some((witness: any, index: number) => {
            const slot = dataFlow.inputSlots[index];
            return witness?.slot !== slot ||
              witness.argument?.name !== slots[slot]?.name ||
              witness.argument?.annotation?.name !== "float" ||
              witness.argument?.annotation_text !== "float";
          })) {
        throw new TypeError("optimizer strict-float region has stale annotations");
      }
    }
    return;
  }
  throw new TypeError(`optimizer target lowering does not handle region ${plan.kind}`);
}

export function verifyOptimizationPass(pass: OptimizationPass): void {
  requireString(pass?.id, "pass.id");
  if (pass.inputSchema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`optimizer pass ${pass.id} has an unknown input schema`);
  }
  if (!IR_LEVELS.includes(pass.acceptedLevel) || !IR_LEVELS.includes(pass.producedLevel)) {
    throw new TypeError(`optimizer pass ${pass.id} has an invalid IR level contract`);
  }
  requireStringArray(pass.factsConsumed, `${pass.id}.factsConsumed`);
  requireStringArray(pass.factsProduced, `${pass.id}.factsProduced`, true);
  requireStringArray(pass.factsInvalidated, `${pass.id}.factsInvalidated`);
  requireStringArray(pass.preserves, `${pass.id}.preserves`, true);
  requireStringArray(pass.guardsIntroduced, `${pass.id}.guardsIntroduced`, true);
  requireStringArray(pass.supportedTargets, `${pass.id}.supportedTargets`, true);
  for (const target of pass.supportedTargets) {
    if (!TARGET_KINDS.has(target)) throw new TypeError(`optimizer pass ${pass.id} has invalid target`);
  }
  requireString(pass.verifier, `${pass.id}.verifier`);
  requireNonnegativeInteger(pass.compilationCostBudget, `${pass.id}.compilationCostBudget`);
  requireNonnegativeInteger(pass.codeSizeBudget, `${pass.id}.codeSizeBudget`);
  requireStringArray(pass.requiredEvidence, `${pass.id}.requiredEvidence`, true);
  if (typeof pass.run !== "function") throw new TypeError(`optimizer pass ${pass.id} has no runner`);
}

export function verifyOptimizationProgram(
  program: OptimizationProgram,
  _options: { allowUnknownPassReferences?: boolean } = {},
): void {
  if (program.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer program schema ${program.schema}`);
  }
  const ids = new Set<string>();
  const passIds = new Set<string>();
  let previousRegions = 0;
  let previousRevision = 0;
  for (const pass of program.passes) {
    requireString(pass.id, "pass.id");
    if (passIds.has(pass.id)) throw new TypeError(`duplicate optimizer pass ${pass.id}`);
    passIds.add(pass.id);
    if (pass.inputSchema !== OPTIMIZER_IR_SCHEMA) {
      throw new TypeError(`optimizer pass ${pass.id} has an unknown input schema`);
    }
    for (const field of [
      "factsConsumed", "factsProduced", "factsInvalidated", "preserves",
      "guardsIntroduced", "supportedTargets", "requiredEvidence",
    ] as const) requireStringArray(pass[field], `pass.${field}`);
    requireString(pass.verifier, "pass.verifier");
    if (!IR_LEVELS.includes(pass.acceptedLevel) || !IR_LEVELS.includes(pass.producedLevel)) {
      throw new TypeError(`optimizer pass ${pass.id} has invalid IR levels`);
    }
    for (const field of [
      "regionsBefore", "regionsAfter", "analysisRevisionBefore",
      "analysisRevisionAfter", "compilationCostBudget", "codeSizeBudget",
    ] as const) requireNonnegativeInteger(pass[field], `pass.${field}`);
    if (pass.regionsBefore !== previousRegions || pass.regionsAfter < pass.regionsBefore) {
      throw new TypeError(`optimizer pass ${pass.id} has invalid region counts`);
    }
    if (pass.analysisRevisionBefore !== previousRevision ||
        pass.analysisRevisionAfter !== pass.analysisRevisionBefore + 1) {
      throw new TypeError(`optimizer pass ${pass.id} has stale analysis revision`);
    }
    previousRegions = pass.regionsAfter;
    previousRevision = pass.analysisRevisionAfter;
  }
  if (previousRegions !== program.regions.length) {
    throw new TypeError("optimizer pass region counts do not match the program");
  }
  for (const decision of program.regions) {
    verifyOptimizationDecision(decision);
    if (ids.has(decision.id)) throw new TypeError(`duplicate optimizer region ${decision.id}`);
    ids.add(decision.id);
    if (!passIds.has(decision.passId)) {
      throw new TypeError(`optimizer region ${decision.id} names an unregistered pass`);
    }
    const pass = program.passes.find((item) => item.id === decision.passId)!;
    for (const fact of decision.facts) {
      if (!pass.factsProduced.includes(fact.kind)) {
        throw new TypeError(`optimizer pass ${pass.id} did not declare fact ${fact.kind}`);
      }
    }
    for (const candidate of decision.target.candidates) {
      if (!pass.supportedTargets.includes(candidate.kind)) {
        throw new TypeError(`optimizer pass ${pass.id} did not declare target ${candidate.kind}`);
      }
    }
  }
}
