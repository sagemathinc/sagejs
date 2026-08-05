export type ForeignLanguage =
  | "magma"
  | "macaulay2"
  | "wolfram"
  | "matlab"
  | "maple";

export interface ForeignLowerOptions {
  filename?: string;
  /** Leave the final visible expression as the evaluator result. */
  captureResult?: boolean;
}

export interface ForeignLowering {
  ast: unknown;
  source: string;
  /** Whether source lowered with captureResult has a visible final value. */
  hasResult?: boolean;
  loadedFiles?: string[];
  attachedFiles?: string[];
}

export interface ForeignFrontend {
  readonly language: ForeignLanguage;
  parse(source: string): unknown;
  lower(
    source: string,
    options?: ForeignLowerOptions,
  ): ForeignLowering;
}

export interface ForeignSyntaxError extends SyntaxError {
  readonly incomplete: boolean;
}
