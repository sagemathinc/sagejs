import { InternalRegionPlan } from "../types";
import { verifyScalarInternalRegionPlan } from "./scalar-plan";
import { verifyBoundedIntegerPlan } from "./bounded-integer";
import { verifyStrictFloatArrayPlan } from "./strict-float-array";
import { verifyFixedExtensionInternalRegionPlan } from "./fixed-extension";
import { verifyModularBatchInternalRegionPlan } from "./modular-batch";

export interface InternalPlanVerifierPlugin {
  readonly id: string;
  readonly internalKinds: readonly string[];
  readonly verify: (plan: InternalRegionPlan) => void;
}

const plugins: readonly InternalPlanVerifierPlugin[] = Object.freeze([
  Object.freeze({
    id: "verify.bounded-integer-plan.v1",
    internalKinds: Object.freeze(["bounded-integer-region"]),
    verify: verifyBoundedIntegerPlan,
  }),
  Object.freeze({
    id: "verify.strict-float-array-plan.v1",
    internalKinds: Object.freeze(["strict-float-array-region"]),
    verify: verifyStrictFloatArrayPlan,
  }),
  Object.freeze({
    id: "verify.modular-batch-plan.v1",
    internalKinds: Object.freeze(["modular-batch-region"]),
    verify: verifyModularBatchInternalRegionPlan,
  }),
  Object.freeze({
    id: "verify.fixed-extension-plan.v1",
    internalKinds: Object.freeze(["fixed-extension-region"]),
    verify: verifyFixedExtensionInternalRegionPlan,
  }),
  Object.freeze({
    id: "verify.scalar-plan.v1",
    internalKinds: Object.freeze([
      "closed-ring-region",
      "strict-float-region",
    ]),
    verify: verifyScalarInternalRegionPlan,
  }),
]);

const byKind = new Map<string, InternalPlanVerifierPlugin>();
for (const plugin of plugins) {
  for (const kind of plugin.internalKinds) {
    if (byKind.has(kind)) {
      throw new TypeError(`duplicate optimizer verifier for ${kind}`);
    }
    byKind.set(kind, plugin);
  }
}

export const internalPlanVerifierCatalog = Object.freeze({ plugins, byKind });

export function verifyInternalRegionPlan(plan: InternalRegionPlan): void {
  const plugin = byKind.get(plan?.kind);
  if (!plugin) {
    throw new TypeError(`optimizer target lowering does not handle region ${plan?.kind}`);
  }
  plugin.verify(plan);
}
