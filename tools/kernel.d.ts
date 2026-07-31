import { EventEmitter } from "events";

export type SageLanguageMode = "sage" | "python";

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

export interface SageSessionOptions {
  mode?: SageLanguageMode;
}

export interface SageCompletion {
  matches: string[];
  cursorStart: number;
  cursorEnd: number;
}

export interface SageInspection {
  found: boolean;
  text: string;
}

export interface DocumentationCompatibility {
  status: "compatible" | "extension" | "partial" | "incompatible";
  notes?: string;
}

export interface DocumentationEntry {
  schema_version: 1;
  name: string;
  aliases: string[];
  kind: "class" | "constant" | "function" | "method" | "object";
  module: string;
  signature: string;
  summary: string;
  doc: string;
  tags: string[];
  backends: string[];
  sage_compatibility: DocumentationCompatibility;
  provenance: Array<{
    kind:
      | "sage-derived"
      | "library-backed"
      | "literature-implemented"
      | "sagejs-original";
    source?: string;
    revision?: string;
    url?: string;
    license?: string;
  }>;
  references: Array<{
    id: string;
    type?: "article" | "book" | "manual" | "paper" | "software" | "web";
    title: string;
    authors?: string[];
    year?: number;
    doi?: string;
    url?: string;
    relevant_sections?: string[];
  }>;
  implementation?: { algorithm?: string; notes?: string };
  limitations: string[];
}

export interface DocumentationCatalog {
  schema_version: 1;
  entries: DocumentationEntry[];
}

export interface SageCompleteness {
  status: "complete" | "incomplete" | "invalid";
  indent?: string;
}

export class SageSessionInterruptedError extends Error {}
export class SageSessionTimeoutError extends Error {}
export class SageSessionClosedError extends Error {}

export class SageSession extends EventEmitter {
  readonly mode: SageLanguageMode;
  constructor(options?: SageSessionOptions);
  ready(): Promise<this>;
  evaluate(
    source: string,
    options?: SageEvaluationOptions,
  ): Promise<SageEvaluationResult>;
  eval(
    source: string,
    options?: SageEvaluationOptions,
  ): Promise<SageEvaluationResult>;
  complete(source: string, cursorPosition: number): Promise<SageCompletion>;
  inspect(source: string, cursorPosition: number): Promise<SageInspection>;
  documentation(): Promise<DocumentationCatalog>;
  isComplete(source: string): Promise<SageCompleteness>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createSage(options?: SageSessionOptions): Promise<SageSession>;
