export const OPTIMIZER_IR_SCHEMA = "sagejs.optimizing-mathematics/v1";

export type OptimizationLevel = "O0" | "O1" | "O2" | "O3" | "Os";

export type FactAuthority = "static" | "runtime-guard" | "contract";

export type OptimizerIrLevel =
  | "sage-semantic"
  | "mathematical"
  | "representation"
  | "target";

export type CostQuantity = number | "runtime-dependent" | "not-applicable";

export interface CompleteTargetCost {
  arithmeticOperations: CostQuantity;
  representationConversions: CostQuantity;
  boundaryCrossings: CostQuantity;
  copiedBytes: CostQuantity;
  allocations: CostQuantity;
  cleanupOperations: CostQuantity;
  compileMilliseconds: CostQuantity;
  instantiateMilliseconds: CostQuantity;
  loadMilliseconds: CostQuantity;
  materializations: CostQuantity;
  emittedBytes: CostQuantity;
  totalUnits: CostQuantity;
}

export interface TargetCandidatePlan {
  id: string;
  kind: "v8" | "wasm" | "native" | "library" | "generic";
  representation: string;
  availability: "selected" | "available" | "runtime-gated" | "rejected";
  rejectionReason: string | null;
  cost: CompleteTargetCost;
  evidence: string;
}

export interface OptimizationFact {
  kind: string;
  authority: FactAuthority;
  evidence: string;
}

export interface SourceRegion {
  filename: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface SemanticRegion {
  level: "sage-semantic";
  revision: number;
  kind: string;
  operations: string[];
  observableExits: string[];
  exceptionPolicy: string;
}

export interface MathematicalRegion {
  level: "mathematical";
  revision: number;
  kind: string;
  domain: string;
  operations: string[];
  exactness: string;
}

export interface RepresentationPlan {
  level: "representation";
  revision: number;
  kind: string;
  candidates: string[];
  conversions: string[];
  materializations: number;
}

export interface TargetPlan {
  level: "target";
  revision: number;
  kind: "v8" | "wasm" | "native" | "library" | "adaptive" | "generic";
  lowering: string;
  boundaryCrossings: number | "runtime-dependent";
  copiedBytes: number | "runtime-dependent";
  selectedCandidate: string;
  candidates: TargetCandidatePlan[];
  policy: string;
}

export interface OptimizationDecision {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  id: string;
  passId: string;
  functionId: string | null;
  source: SourceRegion;
  selected: boolean;
  rejectionReasons: string[];
  semantic: SemanticRegion;
  mathematical: MathematicalRegion;
  facts: OptimizationFact[];
  representation: RepresentationPlan;
  target: TargetPlan;
  guards: string[];
  fallbackId: string;
  cacheIdentityInputs: string[];
}

export interface OptimizationProgram {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  level: OptimizationLevel;
  disabledPasses: string[];
  requiredOptimizations: string[];
  passes: OptimizationPassRecord[];
  contracts: FunctionOptimizationContract[];
  regions: OptimizationDecision[];
}

export type OptimizationCoverage = "at-least-one" | "all-loops";
export type OptimizationGuardFailure = "fallback" | "error";
export type OptimizationTargetRequirement =
  | "auto" | "v8" | "wasm" | "native" | "library" | "generic";

export interface FunctionOptimizationContract {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  id: string;
  functionName: string;
  source: SourceRegion;
  requiredPassId: string;
  coverage: OptimizationCoverage;
  target: OptimizationTargetRequirement;
  guardFailure: OptimizationGuardFailure;
  loopCount: number;
  matchedRegionIds: string[];
  status: "pending" | "satisfied";
}

export interface OptimizationPassRecord {
  id: string;
  domainId: string;
  priority: number;
  claimSemantics: "exclusive";
  inputSchema: typeof OPTIMIZER_IR_SCHEMA;
  factsConsumed: readonly string[];
  factsProduced: readonly string[];
  factsInvalidated: readonly string[];
  preserves: readonly string[];
  acceptedLevel: OptimizerIrLevel;
  producedLevel: OptimizerIrLevel;
  guardsIntroduced: readonly string[];
  supportedTargets: readonly TargetCandidatePlan["kind"][];
  verifier: string;
  compilationCostBudget: number;
  codeSizeBudget: number;
  requiredEvidence: readonly string[];
  analysisRevisionBefore: number;
  analysisRevisionAfter: number;
  regionsBefore: number;
  regionsAfter: number;
}

export interface OptimizationControls {
  level: OptimizationLevel;
  disabledPasses: ReadonlySet<string>;
  requiredOptimizations: ReadonlySet<string>;
  explain: boolean;
}

export interface InternalRegionPlan {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  id: string;
  passId: string;
  loweringId: string;
  functionId: string | null;
  guardFailure: OptimizationGuardFailure;
  kind: string;
  operands: Record<string, any>;
}

export interface OptimizationCandidate {
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >;
  node: any;
  ownerFunction?: any;
  internal: InternalRegionPlan;
  minimumLevel: OptimizationLevel;
  staticRejectionReasons?: readonly string[];
}

/** A recognized semantic region for which no target lowering is claimed. */
export interface OptimizationObservation {
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >;
  node: any;
  ownerFunction?: any;
  minimumLevel: OptimizationLevel;
  rejectionReasons: readonly string[];
}

export interface OptimizationPassContext {
  readonly compiler: any;
  readonly controls: OptimizationControls;
  walk(root: any, visitor: (node: any, ancestors: readonly any[]) => void): void;
  observe(observation: OptimizationObservation): void;
  consider(candidate: OptimizationCandidate): void;
}

export interface OptimizationPass {
  readonly id: string;
  readonly inputSchema: typeof OPTIMIZER_IR_SCHEMA;
  readonly factsConsumed: readonly string[];
  readonly factsProduced: readonly string[];
  readonly factsInvalidated: readonly string[];
  readonly preserves: readonly string[];
  readonly acceptedLevel: OptimizerIrLevel;
  readonly producedLevel: OptimizerIrLevel;
  readonly guardsIntroduced: readonly string[];
  readonly supportedTargets: readonly TargetCandidatePlan["kind"][];
  readonly verifier: string;
  readonly compilationCostBudget: number;
  readonly codeSizeBudget: number;
  readonly requiredEvidence: readonly string[];
  run(root: any, context: OptimizationPassContext): void;
}
