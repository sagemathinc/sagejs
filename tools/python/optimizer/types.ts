export const OPTIMIZER_IR_SCHEMA = "sagejs.optimizing-mathematics/v1";

export type OptimizationLevel = "O0" | "O1" | "O2" | "O3" | "Os";

export type FactAuthority = "static" | "runtime-guard" | "contract";

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
  kind: string;
  operations: string[];
  observableExits: string[];
  exceptionPolicy: string;
}

export interface MathematicalRegion {
  kind: string;
  domain: string;
  operations: string[];
  exactness: string;
}

export interface RepresentationPlan {
  kind: string;
  candidates: string[];
  conversions: string[];
  materializations: number;
}

export interface TargetPlan {
  kind: "v8" | "wasm" | "native" | "library" | "generic";
  lowering: string;
  boundaryCrossings: number;
  copiedBytes: number | "runtime-dependent";
}

export interface OptimizationDecision {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  id: string;
  passId: string;
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
}

export interface OptimizationProgram {
  schema: typeof OPTIMIZER_IR_SCHEMA;
  level: OptimizationLevel;
  disabledPasses: string[];
  requiredOptimizations: string[];
  passes: OptimizationPassRecord[];
  regions: OptimizationDecision[];
}

export interface OptimizationPassRecord {
  id: string;
  inputSchema: typeof OPTIMIZER_IR_SCHEMA;
  factsConsumed: readonly string[];
  factsProduced: readonly string[];
  preserves: readonly string[];
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
  kind: string;
  operands: Record<string, any>;
}

export interface OptimizationCandidate {
  decision: Omit<OptimizationDecision, "selected" | "rejectionReasons">;
  node: any;
  internal: InternalRegionPlan;
  minimumLevel: OptimizationLevel;
}

export interface OptimizationPassContext {
  readonly compiler: any;
  readonly controls: OptimizationControls;
  walk(root: any, visitor: (node: any) => void): void;
  consider(candidate: OptimizationCandidate): void;
}

export interface OptimizationPass {
  readonly id: string;
  readonly inputSchema: typeof OPTIMIZER_IR_SCHEMA;
  readonly factsConsumed: readonly string[];
  readonly factsProduced: readonly string[];
  readonly preserves: readonly string[];
  run(root: any, context: OptimizationPassContext): void;
}
