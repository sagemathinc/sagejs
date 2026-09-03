export interface SageDisplayData {
  /** MIME type understood by an embedding renderer. */
  mime: string;
  /** Structured-clone-safe renderer payload. */
  data: unknown;
}

export interface SageOptimizationReport {
  schema: "sagejs.optimizer-evaluation/v1";
  authority: "compiler-verified-static";
  filename: string;
  program: {
    schema: "sagejs.optimizing-mathematics/v1";
    level: "O0" | "O1" | "O2" | "O3" | "Os";
    disabledPasses: string[];
    requiredOptimizations: string[];
    passes: unknown[];
    contracts: unknown[];
    regions: unknown[];
  };
}

export interface SageEvaluationResult {
  /** Python/Sage representation of the final expression, or empty text. */
  repr: string;
  /** Complete Python print output produced by this evaluation. */
  stdout: string;
  /** Time spent compiling and evaluating inside the worker. */
  durationMs: number;
  /** Optional rich representation of the final value. */
  display?: SageDisplayData;
  /** Compiler-verified static optimizer decisions for this evaluation. */
  optimization: SageOptimizationReport;
}

export interface SageEvaluationOptions {
  filename?: string;
  timeout?: number;
  onOutput?: (text: string) => void;
  onError?: (text: string) => void;
}

export interface BrowserSageSessionOptions {
  /** Default source and runtime semantics for evaluations in this session. */
  mode?: "sage" | "python";
  worker?: string | URL;
  compiler?: string | URL;
  baselib?: string | URL;
  standardLibrary?: string | URL;
  lazyModules?: string | URL;
  conwayData?: string | URL;
  dynamicPrograms?: string | URL;
  flint?: string | URL;
  algebraic?: string | URL;
  nativeKernels?: string | URL;
  m4ri?: string | URL;
  numerical?: string | URL;
  numericalNlopt?: string | URL;
  nloptAdapter?: string | URL;
  symbolic?: string | URL;
  documentation?: string | URL;
  compilerWorker?: string | URL;
  compilerFrontend?: string | URL;
  foreignFrontend?: string | URL;
  treeSitterRuntime?: string | URL;
  pythonGrammar?: string | URL;
  sageGrammar?: string | URL;
  foreignGrammars?: Record<string, string | URL>;
  capabilityReport?: string | URL;
  optimizationLevel?: "O0" | "O1" | "O2" | "O3" | "Os";
  onGraphicsSave?: (request: SageGraphicsSaveRequest) => void | Promise<void>;
}

export interface SageGraphicsSaveRequest {
  display: SageDisplayData;
  filename: string;
  options: {
    format?: string;
    width?: number;
    height?: number;
    scale?: number;
    [name: string]: unknown;
  };
}

export class SageSessionInterruptedError extends Error {}
export class SageSessionTimeoutError extends Error {}
export class SageSessionClosedError extends Error {}

export class SageSession {
  constructor(options?: BrowserSageSessionOptions);
  on(
    type: "stdout" | "stderr",
    listener: (text: string, context: { evaluationId: number }) => void,
  ): this;
  on(type: "ready", listener: () => void): this;
  on(type: "error", listener: (error: Error) => void): this;
  off(type: string, listener: (...parameters: unknown[]) => void): this;
  ready(): Promise<this>;
  evaluate(
    source: string,
    options?: SageEvaluationOptions,
  ): Promise<SageEvaluationResult>;
  eval(
    source: string,
    options?: SageEvaluationOptions,
  ): Promise<SageEvaluationResult>;
  /**
   * Evaluate Sage/Python source and return its final expression as detached
   * JSON-compatible data. Put a multiline expression in a variable and use
   * that variable as the final physical line.
   */
  evaluateJSON(source: string, options?: SageEvaluationOptions): Promise<unknown>;
  /** Return the installed DocSpec v1 catalog. */
  documentation(): Promise<{
    schema_version: 1;
    entries: Array<Record<string, unknown>>;
  }>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createSage(
  options?: BrowserSageSessionOptions,
): Promise<SageSession>;
