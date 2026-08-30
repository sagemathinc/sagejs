import { EventEmitter } from "events";

export type SageLanguageMode = "sage" | "python";

export interface SageDisplayData {
  /** MIME type understood by an embedding renderer. */
  mime: string;
  /** Structured-clone-safe renderer payload. */
  data: unknown;
}

export type SageOutputEvent =
  | {
      schema: "sagejs.output-event/v1";
      type: "stream";
      parentId?: string;
      name: "stdout" | "stderr";
      text: string;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "display_data" | "update_display_data";
      parentId?: string;
      data: Record<string, unknown>;
      metadata: Record<string, unknown>;
      displayId?: string;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "clear_output";
      parentId?: string;
      wait: boolean;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "error";
      parentId?: string;
      name: string;
      message: string;
      traceback: string[];
    };

export interface SageCommEvent {
  schema: "sagejs.comm-event/v1";
  type: "open" | "message" | "close";
  parentId?: string;
  commId: string;
  targetName?: string;
  targetModule?: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  buffers: Uint8Array[];
}

export interface SageCommInfo {
  [commId: string]: { targetName: string };
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
  events: SageOutputEvent[];
  commEvents: SageCommEvent[];
  /** Compiler-verified static optimizer decisions for this evaluation. */
  optimization: SageOptimizationReport;
}

export interface SageEvaluationOptions {
  filename?: string;
  timeout?: number;
  onOutput?: (text: string) => void;
  onEvent?: (event: SageOutputEvent) => void;
  onComm?: (event: SageCommEvent) => void;
  parentId?: string;
  language?:
    | "sage"
    | "python"
    | "magma"
    | "macaulay2"
    | "maple"
    | "matlab"
    | "wolfram";
}

export interface SageSessionOptions {
  mode?: SageLanguageMode;
}

export interface SageLanguageOptions {
  language?: SageEvaluationOptions["language"];
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
  comm(event: SageCommEvent): Promise<void>;
  commInfo(targetName?: string): Promise<SageCommInfo>;
  isComplete(
    source: string,
    options?: SageLanguageOptions,
  ): Promise<SageCompleteness>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createSage(options?: SageSessionOptions): Promise<SageSession>;
