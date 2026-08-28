import { InternalRegionPlan, OptimizationDecision } from "./types";

export interface OptimizerLoweringContract {
  id: string;
  passId: string;
  internalKind: string;
  targetKinds: readonly OptimizationDecision["target"]["kind"][];
  nodeKind: "AST_ForIn";
}

function loweringContract(
  contract: OptimizerLoweringContract,
): OptimizerLoweringContract {
  return Object.freeze({
    ...contract,
    targetKinds: Object.freeze([...contract.targetKinds]),
  });
}

const LOWERING_CONTRACTS: readonly OptimizerLoweringContract[] = Object.freeze([
  loweringContract({
    id: "v8.bounded-integer-loop.v1",
    passId: "math.bounded-integer-region.v1",
    internalKind: "bounded-integer-region",
    targetKinds: ["v8"],
    nodeKind: "AST_ForIn",
  }),
  loweringContract({
    id: "v8.strict-float-array-loop.v1",
    passId: "math.strict-float-array-region.v1",
    internalKind: "strict-float-array-region",
    targetKinds: ["v8"],
    nodeKind: "AST_ForIn",
  }),
  loweringContract({
    id: "v8.strict-float-loop.v1",
    passId: "math.strict-float-region.v1",
    internalKind: "strict-float-region",
    targetKinds: ["v8"],
    nodeKind: "AST_ForIn",
  }),
  loweringContract({
    id: "v8.modular-batch-loop.v1",
    passId: "math.modular-batch-region.v1",
    internalKind: "modular-batch-region",
    targetKinds: ["v8"],
    nodeKind: "AST_ForIn",
  }),
  loweringContract({
    id: "v8.fixed-extension-loop.v1",
    passId: "math.fixed-extension-region.v1",
    internalKind: "fixed-extension-region",
    targetKinds: ["v8", "adaptive"],
    nodeKind: "AST_ForIn",
  }),
  loweringContract({
    id: "v8.closed-ring-loop.v1",
    passId: "math.closed-ring-region.v1",
    internalKind: "closed-ring-region",
    targetKinds: ["v8", "adaptive"],
    nodeKind: "AST_ForIn",
  }),
]);

const LOWERINGS = new Map<string, OptimizerLoweringContract>(
  LOWERING_CONTRACTS.map((contract) => [contract.id, contract]),
);

export function optimizerLoweringContracts(): readonly OptimizerLoweringContract[] {
  return LOWERING_CONTRACTS;
}

export function optimizerLoweringContract(
  id: string,
): OptimizerLoweringContract | undefined {
  return LOWERINGS.get(id);
}

/** Verify that public optimizer evidence and the executable lowering agree. */
export function verifyOptimizerLowering(
  compiler: any,
  node: any,
  internal: InternalRegionPlan,
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >,
): void {
  const lowering = optimizerLoweringContract(internal.loweringId);
  if (!lowering) {
    throw new TypeError(`unknown optimizer lowering ${internal.loweringId}`);
  }
  if (internal.id !== decision.id || internal.passId !== decision.passId) {
    throw new TypeError("optimizer internal and public region identities disagree");
  }
  if (lowering.passId !== internal.passId ||
      lowering.internalKind !== internal.kind ||
      !lowering.targetKinds.includes(decision.target.kind)) {
    throw new TypeError(
      `optimizer lowering ${lowering.id} does not match its pass, plan, or target`,
    );
  }
  if (lowering.nodeKind === "AST_ForIn" &&
      !(node instanceof compiler.AST_ForIn)) {
    throw new TypeError(
      `optimizer lowering ${lowering.id} cannot attach to ${node?.constructor?.name ?? "unknown"}`,
    );
  }
}
