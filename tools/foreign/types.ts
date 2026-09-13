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

/** Stable, machine-readable frontend diagnostic shared by parser frontends. */
export interface ForeignFrontendDiagnostic {
  readonly code:
    | "invalid_frontend_arguments"
    | "parse_failure"
    | "unsupported_operation";
  readonly message: string;
  readonly operation: string | null;
  readonly language: ForeignLanguage;
  readonly option: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export function foreignFrontendDiagnostic(
  language: ForeignLanguage,
  code: ForeignFrontendDiagnostic["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ForeignFrontendDiagnostic {
  return {
    code,
    message,
    operation: null,
    language,
    option: null,
    details,
  };
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
  readonly diagnostic?: ForeignFrontendDiagnostic;
}
