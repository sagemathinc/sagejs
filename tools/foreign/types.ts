export type ForeignLanguage = "magma" | "wolfram" | "matlab" | "maple";

export interface ForeignLowerOptions {
  filename?: string;
}

export interface ForeignLowering {
  ast: unknown;
  source: string;
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
