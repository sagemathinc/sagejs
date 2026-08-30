export interface SageDisplayData {
  /** MIME type understood by an embedding renderer. */
  mime: string;
  /** Structured-clone-safe renderer payload. */
  data: unknown;
}

export interface SageOutputEvent {
  schema: "sagejs.output-event/v1";
  type: "stream" | "display_data" | "update_display_data" | "clear_output" | "error";
  parentId?: string;
  [name: string]: unknown;
}

export interface SageCommEvent {
  schema: "sagejs.comm-event/v1";
  type: "open" | "message" | "close";
  commId: string;
  parentId?: string;
  targetName?: string;
  targetModule?: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  buffers: Uint8Array[];
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
  onEvent?: (event: SageOutputEvent) => void;
  onComm?: (event: SageCommEvent) => void;
}

export interface BrowserSageSessionOptions {
  worker?: string | URL;
  compiler?: string | URL;
  baselib?: string | URL;
  standardLibrary?: string | URL;
  lazyModules?: string | URL;
  flint?: string | URL;
  m4ri?: string | URL;
  symbolic?: string | URL;
  compilerWorker?: string | URL;
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
  on(
    type: "output",
    listener: (event: SageOutputEvent, context: { requestId: number }) => void,
  ): this;
  on(
    type: "comm",
    listener: (event: SageCommEvent, context: { requestId: number }) => void,
  ): this;
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
  comm(event: SageCommEvent, handlers?: {
    onOutput?: (text: string) => void;
    onError?: (text: string) => void;
    onEvent?: (event: SageOutputEvent) => void;
    onComm?: (event: SageCommEvent) => void;
  }): Promise<void>;
  commInfo(targetName?: string): Promise<Record<string, unknown>>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createSage(
  options?: BrowserSageSessionOptions,
): Promise<SageSession>;
