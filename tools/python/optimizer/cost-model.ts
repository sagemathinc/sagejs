import {
  CompleteTargetCost,
  CostQuantity,
  TargetCandidatePlan,
} from "./types";

const COST_KEYS: readonly (keyof CompleteTargetCost)[] = [
  "arithmeticOperations",
  "representationConversions",
  "boundaryCrossings",
  "copiedBytes",
  "allocations",
  "cleanupOperations",
  "compileMilliseconds",
  "instantiateMilliseconds",
  "loadMilliseconds",
  "materializations",
  "emittedBytes",
  "totalUnits",
];

/** Construct a complete cost record; omitted components remain explicitly unknown. */
export function completeTargetCost(
  values: Partial<CompleteTargetCost> = {},
): CompleteTargetCost {
  return Object.fromEntries(COST_KEYS.map((key) => [
    key,
    values[key] ?? "runtime-dependent",
  ])) as unknown as CompleteTargetCost;
}

export function targetCandidate(values: {
  id: string;
  kind: TargetCandidatePlan["kind"];
  representation: string;
  availability: TargetCandidatePlan["availability"];
  rejectionReason?: string | null;
  cost?: Partial<CompleteTargetCost>;
  evidence: string;
}): TargetCandidatePlan {
  return {
    id: values.id,
    kind: values.kind,
    representation: values.representation,
    availability: values.availability,
    rejectionReason: values.rejectionReason ?? null,
    cost: completeTargetCost(values.cost),
    evidence: values.evidence,
  };
}

export function isCostQuantity(value: unknown): value is CostQuantity {
  return value === "runtime-dependent" || value === "not-applicable" ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
