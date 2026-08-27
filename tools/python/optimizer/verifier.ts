import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationProgram,
} from "./types";

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`optimizer IR ${field} must be a nonempty string`);
  }
}

export function verifyOptimizationDecision(
  decision: OptimizationDecision,
): void {
  if (decision.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer decision schema ${decision.schema}`);
  }
  requireString(decision.id, "id");
  requireString(decision.passId, "passId");
  requireString(decision.fallbackId, "fallbackId");
  requireString(decision.semantic?.kind, "semantic.kind");
  requireString(decision.mathematical?.kind, "mathematical.kind");
  requireString(decision.representation?.kind, "representation.kind");
  requireString(decision.target?.kind, "target.kind");
  if (!Array.isArray(decision.facts) || decision.facts.length === 0) {
    throw new TypeError(`optimizer region ${decision.id} has no facts`);
  }
  for (const fact of decision.facts) {
    requireString(fact.kind, "fact.kind");
    requireString(fact.evidence, "fact.evidence");
    if (!["static", "runtime-guard", "contract"].includes(fact.authority)) {
      throw new TypeError(
        `optimizer region ${decision.id} has invalid fact authority`,
      );
    }
  }
  if (decision.selected && decision.rejectionReasons.length !== 0) {
    throw new TypeError(`selected optimizer region ${decision.id} was rejected`);
  }
  if (!decision.selected && decision.rejectionReasons.length === 0) {
    throw new TypeError(`rejected optimizer region ${decision.id} has no reason`);
  }
  if (decision.selected && decision.target.kind === "generic") {
    throw new TypeError(`selected optimizer region ${decision.id} is generic`);
  }
  if (!Number.isSafeInteger(decision.representation.materializations) ||
      decision.representation.materializations < 0) {
    throw new TypeError(`optimizer region ${decision.id} has invalid materializations`);
  }
  if (!Number.isSafeInteger(decision.target.boundaryCrossings) ||
      decision.target.boundaryCrossings < 0) {
    throw new TypeError(`optimizer region ${decision.id} has invalid crossings`);
  }
}

export function verifyOptimizationProgram(program: OptimizationProgram): void {
  if (program.schema !== OPTIMIZER_IR_SCHEMA) {
    throw new TypeError(`unknown optimizer program schema ${program.schema}`);
  }
  const ids = new Set<string>();
  const passIds = new Set<string>();
  for (const pass of program.passes) {
    requireString(pass.id, "pass.id");
    if (passIds.has(pass.id)) throw new TypeError(`duplicate optimizer pass ${pass.id}`);
    passIds.add(pass.id);
    if (pass.inputSchema !== OPTIMIZER_IR_SCHEMA) {
      throw new TypeError(`optimizer pass ${pass.id} has an unknown input schema`);
    }
    if (!Number.isSafeInteger(pass.regionsBefore) ||
        !Number.isSafeInteger(pass.regionsAfter) ||
        pass.regionsBefore < 0 || pass.regionsAfter < pass.regionsBefore) {
      throw new TypeError(`optimizer pass ${pass.id} has invalid region counts`);
    }
  }
  for (const decision of program.regions) {
    verifyOptimizationDecision(decision);
    if (ids.has(decision.id)) {
      throw new TypeError(`duplicate optimizer region ${decision.id}`);
    }
    ids.add(decision.id);
    if (!passIds.has(decision.passId)) {
      throw new TypeError(
        `optimizer region ${decision.id} names an unregistered pass`,
      );
    }
  }
}
