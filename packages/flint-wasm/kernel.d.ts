export interface SageDisplayData {
  /** MIME type understood by an embedding renderer. */
  mime: string;
  /** Structured-clone-safe renderer payload. */
  data: unknown;
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
}

export interface SageEvaluationOptions {
  filename?: string;
  timeout?: number;
  onOutput?: (text: string) => void;
}

export interface BrowserSageSessionOptions {
  worker?: string | URL;
  compiler?: string | URL;
  baselib?: string | URL;
  flint?: string | URL;
  compilerWorker?: string | URL;
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
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createSage(
  options?: BrowserSageSessionOptions,
): Promise<SageSession>;
