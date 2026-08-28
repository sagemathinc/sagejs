import {
  analyzePackedContainer,
  requirePackedContainerPlan,
} from "../../analyses/packed-containers";
import {
  PACKED_CONTAINER_ANALYSIS_ID,
  PACKED_CONTAINER_FACT_KINDS,
  PACKED_CONTAINER_REPRESENTATION_ID,
  PACKED_CONTAINER_VERIFIER_ID,
} from "../../representations/packed-machine-container";
import { verifyPackedMachineContainerPlan } from "../../verifiers/packed-machine-container";

export const PACKED_CONTAINER_DOMAIN_ID = "packed-machine-container" as const;
export const PACKED_CONTAINER_FACT_PROVIDER_ID =
  "math.packed-machine-container-facts.v1" as const;
export const PACKED_CONTAINER_PLANNING_ID =
  "plan.owner-bound-packed-container.v1" as const;

/**
 * Integration descriptor for a target-neutral fact provider.
 *
 * This is not an executable region lowering: consuming mathematical-domain
 * plugins own their emitted targets and exact same-source fallbacks.
 */
export const packedContainerDomainPlugin = Object.freeze({
  id: PACKED_CONTAINER_FACT_PROVIDER_ID,
  domainId: PACKED_CONTAINER_DOMAIN_ID,
  priority: 400,
  claimSemantics: "exclusive" as const,
  analysisId: PACKED_CONTAINER_ANALYSIS_ID,
  planningId: PACKED_CONTAINER_PLANNING_ID,
  representationId: PACKED_CONTAINER_REPRESENTATION_ID,
  verifierId: PACKED_CONTAINER_VERIFIER_ID,
  factsProduced: PACKED_CONTAINER_FACT_KINDS,
  supportedConsumers: Object.freeze(["v8", "wasm", "native"] as const),
  publicMutableStorage: false as const,
  analyze: analyzePackedContainer,
  requirePlan: requirePackedContainerPlan,
  verify: verifyPackedMachineContainerPlan,
});

export {
  analyzePackedContainer,
  requirePackedContainerPlan,
  verifyPackedMachineContainerPlan,
};
export * from "../../analyses/packed-containers/contracts";
export * from "../../representations/packed-machine-container";
