import { isCostQuantity } from "./cost-model";
import {
  CompleteTargetCost,
  FunctionOptimizationContract,
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationPass,
  OptimizationProgram,
  TargetCandidatePlan,
} from "./types";

export { verifyInternalRegionPlan } from "./verifiers/catalog";

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

function verifySource(decision: { id: string; source: any }): void {
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

function verifyFunctionContract(contract: FunctionOptimizationContract): void {
  if (contract.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer contract schema ${contract.schema}`);
  }
  requireString(contract.id, "contract.id");
  requireString(contract.functionName, "contract.functionName");
  requireString(contract.requiredPassId, "contract.requiredPassId");
  verifySource(contract);
  if (contract.coverage !== "all-loops" && contract.coverage !== "at-least-one") {
    throw new TypeError(`optimizer contract ${contract.id} has invalid coverage`);
  }
  if (!["auto", "v8", "wasm", "native", "library", "generic"].includes(
    contract.target,
  )) throw new TypeError(`optimizer contract ${contract.id} has invalid target`);
  if (contract.guardFailure !== "fallback" && contract.guardFailure !== "error") {
    throw new TypeError(`optimizer contract ${contract.id} has invalid guard policy`);
  }
  requireNonnegativeInteger(contract.loopCount, "contract.loopCount");
  requireStringArray(contract.matchedRegionIds, "contract.matchedRegionIds");
  if (contract.status !== "pending" && contract.status !== "satisfied") {
    throw new TypeError(`optimizer contract ${contract.id} has invalid status`);
  }
  if (contract.status === "satisfied" && contract.matchedRegionIds.length === 0) {
    throw new TypeError(`satisfied optimizer contract ${contract.id} has no regions`);
  }
}

export function verifyOptimizationDecision(decision: OptimizationDecision): void {
  if (decision.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer decision schema ${decision.schema}`);
  }
  requireString(decision.id, "id");
  requireString(decision.passId, "passId");
  if (decision.functionId !== null) requireString(decision.functionId, "functionId");
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
    requireString(pass.domainId, "pass.domainId");
    requireNonnegativeInteger(pass.priority, "pass.priority");
    if (pass.claimSemantics !== "exclusive") {
      throw new TypeError(`optimizer pass ${pass.id} has invalid claim semantics`);
    }
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
  if (!Array.isArray(program.contracts)) {
    throw new TypeError("optimizer program contracts must be an array");
  }
  const contractIds = new Set<string>();
  for (const contract of program.contracts) {
    verifyFunctionContract(contract);
    if (contractIds.has(contract.id)) {
      throw new TypeError(`duplicate optimizer contract ${contract.id}`);
    }
    contractIds.add(contract.id);
  }
  for (const decision of program.regions) {
    verifyOptimizationDecision(decision);
    if (ids.has(decision.id)) throw new TypeError(`duplicate optimizer region ${decision.id}`);
    ids.add(decision.id);
    if (decision.functionId !== null && !contractIds.has(decision.functionId)) {
      throw new TypeError(
        `optimizer region ${decision.id} references unknown function contract ${decision.functionId}`,
      );
    }
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
  for (const contract of program.contracts) {
    for (const regionId of contract.matchedRegionIds) {
      if (!ids.has(regionId)) {
        throw new TypeError(
          `optimizer contract ${contract.id} references unknown region ${regionId}`,
        );
      }
    }
  }
}
