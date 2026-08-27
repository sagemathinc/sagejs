import { verifyOptimizationProgram } from "./verifier";
import { OptimizationProgram } from "./types";

/** Return a detached, deterministically ordered optimizer-IR explanation. */
export function explainOptimizationProgram(program: OptimizationProgram): any {
  verifyOptimizationProgram(program);
  return JSON.parse(JSON.stringify({
    schema: program.schema,
    level: program.level,
    disabledPasses: [...program.disabledPasses].sort(),
    requiredOptimizations: [...program.requiredOptimizations].sort(),
    passes: program.passes.map((pass) => ({
      ...pass,
      factsConsumed: [...pass.factsConsumed].sort(),
      factsProduced: [...pass.factsProduced].sort(),
      preserves: [...pass.preserves].sort(),
    })),
    regions: [...program.regions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((region) => ({
        ...region,
        facts: [...region.facts].sort((left, right) =>
          left.kind.localeCompare(right.kind)
        ),
        guards: [...region.guards].sort(),
        rejectionReasons: [...region.rejectionReasons].sort(),
        cacheIdentityInputs: [...region.cacheIdentityInputs].sort(),
        target: {
          ...region.target,
          candidates: [...region.target.candidates]
            .sort((left, right) => left.id.localeCompare(right.id)),
        },
      })),
  }));
}

export function formatOptimizationExplanation(
  program: OptimizationProgram,
): string {
  const explanation = explainOptimizationProgram(program);
  const lines = [
    `optimizer ${explanation.schema} level=${explanation.level}`,
  ];
  for (const pass of explanation.passes) {
    lines.push(
      `pass ${pass.id}: regions ${pass.regionsBefore} -> ${pass.regionsAfter}`,
    );
  }
  if (!explanation.regions.length) lines.push("no optimization candidates");
  for (const region of explanation.regions) {
    lines.push(`${region.selected ? "selected" : "rejected"} ${region.id}`);
    lines.push(`  math: ${region.mathematical.kind}`);
    lines.push(`  representation: ${region.representation.kind}`);
    lines.push(`  target: ${region.target.kind}/${region.target.lowering}`);
    lines.push(`  target-policy: ${region.target.policy}`);
    lines.push(`  selected-candidate: ${region.target.selectedCandidate}`);
    lines.push(`  fallback: ${region.fallbackId}`);
    lines.push(
      `  crossings/copied/materializations: ` +
        `${region.target.boundaryCrossings}/${region.target.copiedBytes}/` +
        `${region.representation.materializations}`,
    );
    if (region.rejectionReasons.length) {
      lines.push(`  reasons: ${region.rejectionReasons.join(", ")}`);
    }
    for (const fact of region.facts) {
      lines.push(`  fact ${fact.kind} [${fact.authority}]: ${fact.evidence}`);
    }
    for (const candidate of region.target.candidates) {
      lines.push(
        `  candidate ${candidate.id}: ${candidate.kind}/` +
          `${candidate.representation} [${candidate.availability}]` +
          `${candidate.rejectionReason ? ` reason=${candidate.rejectionReason}` : ""}`,
      );
      lines.push(
        `    cost crossings=${candidate.cost.boundaryCrossings} ` +
          `copied=${candidate.cost.copiedBytes} allocations=${candidate.cost.allocations} ` +
          `compile=${candidate.cost.compileMilliseconds} ` +
          `load=${candidate.cost.loadMilliseconds} emitted=${candidate.cost.emittedBytes}`,
      );
    }
    lines.push(`  cache-inputs: ${region.cacheIdentityInputs.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}
