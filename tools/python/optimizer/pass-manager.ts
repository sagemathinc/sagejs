import { optimizationLevelRank } from "./controls";
import { OptimizerCatalog, OptimizerPassPlugin } from "./catalog";
import {
  collectOptimizationContracts,
  CollectedOptimizationContracts,
} from "./contracts";
import { verifyOptimizerLowering } from "./lowerings";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationCandidate,
  OptimizationControls,
  OptimizationDecision,
  OptimizationPassContext,
  OptimizationProgram,
} from "./types";
import {
  verifyInternalRegionPlan,
  verifyOptimizationDecision,
  verifyOptimizationProgram,
  verifyOptimizationPass,
} from "./verifier";

const IGNORED_AST_KEYS = new Set([
  "start", "end", "scope", "thedef", "imports", "globals", "classes",
  "baselib", "optimization_ir", "optimization_region", "optimization_contract",
]);

export class OptimizerPassManager implements OptimizationPassContext {
  readonly program: OptimizationProgram;
  private readonly claimedNodes = new WeakSet<object>();
  private readonly decisionByNode = new WeakMap<object, OptimizationDecision>();
  private contracts!: CollectedOptimizationContracts;
  private activePlugin?: OptimizerPassPlugin;
  private analysisRevision = 0;

  constructor(
    readonly compiler: any,
    readonly controls: OptimizationControls,
    private readonly catalog: OptimizerCatalog,
  ) {
    this.program = {
      schema: OPTIMIZER_IR_SCHEMA,
      level: controls.level,
      disabledPasses: [...controls.disabledPasses].sort(),
      requiredOptimizations: [...controls.requiredOptimizations].sort(),
      passes: [],
      contracts: [],
      regions: [],
    };
  }

  walk(root: any, visitor: (node: any, ancestors: readonly any[]) => void): void {
    const seen = new Set<any>();
    const visit = (value: any, ancestors: readonly any[]): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child, ancestors);
        return;
      }
      if (!(value instanceof this.compiler.AST_Node)) return;
      visitor(value, ancestors);
      const childAncestors = [...ancestors, value];
      for (const [key, child] of Object.entries(value)) {
        if (IGNORED_AST_KEYS.has(key) || typeof child === "function") continue;
        visit(child, childAncestors);
      }
    };
    visit(root, []);
  }

  consider(candidate: OptimizationCandidate): void {
    const plugin = this.activePlugin;
    if (!plugin || candidate.decision.passId !== plugin.id ||
        candidate.internal.passId !== plugin.id) {
      throw new TypeError("optimizer candidate was submitted outside its registered plugin");
    }
    if (!plugin.loweringIds.includes(candidate.internal.loweringId)) {
      throw new TypeError(
        `optimizer plugin ${plugin.id} submitted unowned lowering ` +
          candidate.internal.loweringId,
      );
    }
    // Pass ordering is deterministic.  Once an earlier, more specific pass
    // has considered a semantic region, a broader pass may not reinterpret
    // the same node under a different contract merely because the first pass
    // was disabled or rejected by the selected optimization level.
    if (this.claimedNodes.has(candidate.node)) return;
    if (plugin.claimSemantics === "exclusive") this.claimedNodes.add(candidate.node);
    const functionContract = candidate.ownerFunction
      ? this.contracts.byFunction.get(candidate.ownerFunction)
      : undefined;
    candidate.internal.functionId = functionContract?.id ?? null;
    candidate.internal.guardFailure = functionContract?.guardFailure ?? "fallback";
    verifyInternalRegionPlan(candidate.internal);
    verifyOptimizerLowering(
      this.compiler,
      candidate.node,
      candidate.internal,
      candidate.decision,
    );
    const reasons: string[] = [...(candidate.staticRejectionReasons ?? [])];
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
      functionId: functionContract?.id ?? null,
      selected,
      rejectionReasons: reasons,
    };
    verifyOptimizationDecision(decision);
    this.program.regions.push(decision);
    this.decisionByNode.set(candidate.node, decision);
    if (selected) candidate.node.optimization_region = candidate.internal;
  }

  run(root: any): OptimizationProgram {
    this.contracts = collectOptimizationContracts(this.compiler, root);
    this.program.contracts = this.contracts.contracts;
    const passIds = new Set<string>();
    for (const plugin of this.catalog.plugins) {
      const pass = plugin.pass;
      verifyOptimizationPass(pass);
      if (pass.inputSchema !== OPTIMIZER_IR_SCHEMA) {
        throw new TypeError(
          `optimizer pass ${pass.id} consumes unknown schema ${pass.inputSchema}`,
        );
      }
      if (passIds.has(pass.id)) throw new TypeError(`duplicate optimizer pass ${pass.id}`);
      passIds.add(pass.id);
      const regionsBefore = this.program.regions.length;
      const analysisRevisionBefore = this.analysisRevision;
      this.activePlugin = plugin;
      try {
        pass.run(root, this);
      } finally {
        this.activePlugin = undefined;
      }
      this.analysisRevision += 1;
      this.program.passes.push({
        id: pass.id,
        domainId: plugin.domainId,
        priority: plugin.priority,
        claimSemantics: plugin.claimSemantics,
        inputSchema: pass.inputSchema,
        factsConsumed: [...pass.factsConsumed],
        factsProduced: [...pass.factsProduced],
        factsInvalidated: [...pass.factsInvalidated],
        preserves: [...pass.preserves],
        acceptedLevel: pass.acceptedLevel,
        producedLevel: pass.producedLevel,
        guardsIntroduced: [...pass.guardsIntroduced],
        supportedTargets: [...pass.supportedTargets],
        verifier: pass.verifier,
        compilationCostBudget: pass.compilationCostBudget,
        codeSizeBudget: pass.codeSizeBudget,
        requiredEvidence: [...pass.requiredEvidence],
        analysisRevisionBefore,
        analysisRevisionAfter: this.analysisRevision,
        regionsBefore,
        regionsAfter: this.program.regions.length,
      });
      verifyOptimizationProgram(this.program, { allowUnknownPassReferences: false });
    }
    this.program.regions.sort((left, right) => left.id.localeCompare(right.id));
    this.enforceFunctionContracts();
    this.enforceRequirements();
    verifyOptimizationProgram(this.program);
    root.optimization_ir = this.program;
    return this.program;
  }

  private lexicalLoops(definition: any): any[] {
    const loops: any[] = [];
    const seen = new Set<any>();
    const visit = (value: any): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      if (!(value instanceof this.compiler.AST_Node)) return;
      if (value !== definition &&
          (value instanceof this.compiler.AST_Function ||
           value instanceof this.compiler.AST_Class)) return;
      if (value instanceof this.compiler.AST_ForIn ||
          value instanceof this.compiler.AST_While) loops.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (IGNORED_AST_KEYS.has(key) || typeof child === "function") continue;
        visit(child);
      }
    };
    visit(definition.body);
    return loops;
  }

  private enforceFunctionContracts(): void {
    for (const { definition, contract } of this.contracts.entries) {
      const loops = this.lexicalLoops(definition);
      const matches = loops.flatMap((loop) => {
        const region = this.decisionByNode.get(loop);
        if (!region || !region.selected || region.passId !== contract.requiredPassId) {
          return [];
        }
        if (contract.target !== "auto" && region.target.kind !== contract.target) {
          return [];
        }
        return [region];
      });
      contract.matchedRegionIds = matches.map((region) => region.id).sort();
      const satisfied = contract.coverage === "all-loops"
        ? loops.length > 0 && matches.length === loops.length
        : matches.length > 0;
      if (!satisfied) {
        const details = loops.map((loop) => {
          const region = this.decisionByNode.get(loop);
          const location = `${loop.start?.line ?? 0}:${loop.start?.col ?? 0}`;
          if (!region) return `${location}: no optimizer candidate`;
          if (!region.selected) {
            return `${location}: ${region.passId} rejected (` +
              `${region.rejectionReasons.join(",")})`;
          }
          if (region.passId !== contract.requiredPassId) {
            return `${location}: selected ${region.passId}`;
          }
          return `${location}: selected target ${region.target.kind}`;
        }).join("; ");
        throw new Error(
          `optimization contract for ${contract.functionName} was not satisfied: ` +
          `require=${contract.requiredPassId}, coverage=${contract.coverage}, ` +
          `target=${contract.target}` + (details ? ` (${details})` : " (no loops)"),
        );
      }
      contract.status = "satisfied";
    }
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
