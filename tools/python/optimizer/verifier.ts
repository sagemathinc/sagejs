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

function verifyExpression(expression: any, slotCount: number, sequenceCount: number): void {
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
    return;
  }
  if (expression.kind === "neg") {
    verifyExpression(expression.value, slotCount, sequenceCount);
    return;
  }
  if (expression.kind === "binary" && ["+", "-", "*"].includes(expression.operator)) {
    verifyExpression(expression.left, slotCount, sequenceCount);
    verifyExpression(expression.right, slotCount, sequenceCount);
    return;
  }
  throw new TypeError(`optimizer target-independent expression ${expression.kind} is unhandled`);
}

function verifyStatements(statements: any, slotCount: number, sequenceCount: number): void {
  if (!Array.isArray(statements)) throw new TypeError("optimizer statements must be an array");
  for (const statement of statements) {
    if (statement?.kind === "assign") {
      if (!Number.isSafeInteger(statement.target) || statement.target < 0 ||
          statement.target >= slotCount) throw new TypeError("optimizer assignment target is out of range");
      verifyExpression(statement.value, slotCount, sequenceCount);
    } else if (statement?.kind === "if") {
      if (statement.condition?.kind !== "equal") {
        throw new TypeError("optimizer condition is unhandled");
      }
      verifyExpression(statement.condition.left, slotCount, sequenceCount);
      verifyExpression(statement.condition.right, slotCount, sequenceCount);
      verifyStatements(statement.body, slotCount, sequenceCount);
      verifyStatements(statement.alternative, slotCount, sequenceCount);
    } else {
      throw new TypeError(`optimizer target-independent statement ${statement?.kind} is unhandled`);
    }
  }
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
  if (plan.kind === "closed-ring-region") {
    const slots = plan.operands.slots;
    const sequences = plan.operands.sequences;
    if (!Array.isArray(slots) || slots.length === 0 || !Array.isArray(sequences)) {
      throw new TypeError("optimizer ring region has invalid slots or sequences");
    }
    verifyStatements(plan.operands.statements, slots.length, sequences.length);
    for (const slot of plan.operands.stateSlots ?? []) {
      if (!Number.isSafeInteger(slot) || slot < 0 || slot >= slots.length) {
        throw new TypeError("optimizer state slot is out of range");
      }
    }
    const affine = plan.operands.affine;
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
