import { optimizationLevelRank } from "./controls";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationCandidate,
  OptimizationControls,
  OptimizationDecision,
  OptimizationPass,
  OptimizationPassContext,
  OptimizationProgram,
} from "./types";
import { verifyOptimizationProgram } from "./verifier";

const IGNORED_AST_KEYS = new Set([
  "start", "end", "scope", "thedef", "imports", "globals", "classes",
  "baselib", "optimization_ir", "optimization_region",
]);

export class OptimizerPassManager implements OptimizationPassContext {
  readonly program: OptimizationProgram;

  constructor(
    readonly compiler: any,
    readonly controls: OptimizationControls,
    private readonly passes: readonly OptimizationPass[],
  ) {
    this.program = {
      schema: OPTIMIZER_IR_SCHEMA,
      level: controls.level,
      disabledPasses: [...controls.disabledPasses].sort(),
      requiredOptimizations: [...controls.requiredOptimizations].sort(),
      passes: [],
      regions: [],
    };
  }

  walk(root: any, visitor: (node: any) => void): void {
    const seen = new Set<any>();
    const visit = (value: any): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      if (!(value instanceof this.compiler.AST_Node)) return;
      visitor(value);
      for (const [key, child] of Object.entries(value)) {
        if (IGNORED_AST_KEYS.has(key) || typeof child === "function") continue;
        visit(child);
      }
    };
    visit(root);
  }

  consider(candidate: OptimizationCandidate): void {
    const reasons: string[] = [];
    if (this.controls.disabledPasses.has(candidate.decision.passId)) {
      reasons.push("pass-disabled");
    }
    if (optimizationLevelRank(this.controls.level) <
        optimizationLevelRank(candidate.minimumLevel)) {
      reasons.push("optimization-level-too-low");
    }
    const selected = reasons.length === 0;
    const decision: OptimizationDecision = {
      ...candidate.decision,
      selected,
      rejectionReasons: reasons,
    };
    this.program.regions.push(decision);
    if (selected) candidate.node.optimization_region = candidate.internal;
  }

  run(root: any): OptimizationProgram {
    const passIds = new Set<string>();
    for (const pass of this.passes) {
      if (pass.inputSchema !== OPTIMIZER_IR_SCHEMA) {
        throw new TypeError(
          `optimizer pass ${pass.id} consumes unknown schema ${pass.inputSchema}`,
        );
      }
      if (passIds.has(pass.id)) throw new TypeError(`duplicate optimizer pass ${pass.id}`);
      passIds.add(pass.id);
      const regionsBefore = this.program.regions.length;
      pass.run(root, this);
      this.program.passes.push({
        id: pass.id,
        inputSchema: pass.inputSchema,
        factsConsumed: [...pass.factsConsumed],
        factsProduced: [...pass.factsProduced],
        preserves: [...pass.preserves],
        regionsBefore,
        regionsAfter: this.program.regions.length,
      });
    }
    this.program.regions.sort((left, right) => left.id.localeCompare(right.id));
    verifyOptimizationProgram(this.program);
    this.enforceRequirements();
    root.optimization_ir = this.program;
    return this.program;
  }

  private enforceRequirements(): void {
    for (const requirement of this.controls.requiredOptimizations) {
      const selected = this.program.regions.some((region) =>
        region.selected &&
        (region.passId === requirement || region.id === requirement)
      );
      if (!selected) {
        const considered = this.program.regions
          .filter((region) => region.passId === requirement || region.id === requirement)
          .map((region) => `${region.id}: ${region.rejectionReasons.join(",")}`)
          .join("; ");
        throw new Error(
          `required optimization ${requirement} was not selected` +
            (considered ? ` (${considered})` : ""),
        );
      }
    }
  }
}
