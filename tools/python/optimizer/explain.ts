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
    lines.push(`  fallback: ${region.fallbackId}`);
    if (region.rejectionReasons.length) {
      lines.push(`  reasons: ${region.rejectionReasons.join(", ")}`);
    }
    for (const fact of region.facts) {
      lines.push(`  fact ${fact.kind} [${fact.authority}]: ${fact.evidence}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
