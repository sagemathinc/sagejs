import { InternalRegionPlan, OptimizationDecision } from "./types";

export interface OptimizerLoweringContract {
  id: string;
  passId: string;
  internalKind: string;
  targetKinds: readonly OptimizationDecision["target"]["kind"][];
  nodeKind: "AST_ForIn";
}

const LOWERINGS = new Map<string, OptimizerLoweringContract>([
  [
    "v8.strict-float-loop.v1",
    {
      id: "v8.strict-float-loop.v1",
      passId: "math.strict-float-region.v1",
      internalKind: "strict-float-region",
      targetKinds: ["v8"],
      nodeKind: "AST_ForIn",
    },
  ],
  [
    "v8.closed-ring-loop.v1",
    {
      id: "v8.closed-ring-loop.v1",
      passId: "math.closed-ring-region.v1",
      internalKind: "closed-ring-region",
      targetKinds: ["v8", "adaptive"],
      nodeKind: "AST_ForIn",
    },
  ],
]);

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
