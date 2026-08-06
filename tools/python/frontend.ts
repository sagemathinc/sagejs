import type { Node as SyntaxNode, Parser, Tree } from "web-tree-sitter";

import {
  createTreeSitterParser,
  firstSyntaxError,
  sourceSpan,
  SourceSpan,
} from "../foreign/tree-sitter";

export type PythonSyntaxMode = "python" | "sage";

export interface PythonSyntaxDiagnostic {
  kind: "error" | "missing";
  nodeType: string;
  text: string;
  span: SourceSpan;
}

export interface PythonSyntaxTree {
  mode: PythonSyntaxMode;
  source: string;
  tree: Tree;
  diagnostics: PythonSyntaxDiagnostic[];
  nodeTypes: ReadonlySet<string>;
}

export class PythonSyntaxError extends SyntaxError {
  readonly diagnostic: PythonSyntaxDiagnostic;
  readonly line: number;
  readonly col: number;
  readonly pos: number;
  readonly is_eof: boolean;

  constructor(filename: string, diagnostic: PythonSyntaxDiagnostic, eof: number) {
    const { line, column, offset } = diagnostic.span.start;
    super(
      `${filename}:${line}:${column}: invalid ${diagnostic.nodeType} syntax`,
    );
    this.name = "PythonSyntaxError";
    this.diagnostic = diagnostic;
    this.line = line;
    this.col = column;
    this.pos = offset;
    this.is_eof = diagnostic.span.end.offset >= eof;
  }
}

function collect(
  node: SyntaxNode,
  diagnostics: PythonSyntaxDiagnostic[],
  nodeTypes: Set<string>,
): void {
  if (node.isNamed) nodeTypes.add(node.type);
  if (node.isError || node.isMissing) {
    diagnostics.push({
      kind: node.isMissing ? "missing" : "error",
      nodeType: node.type,
      text: node.text,
      span: sourceSpan(node),
    });
  }
  for (const child of node.children) collect(child, diagnostics, nodeTypes);
}

/**
 * Portable, authoritative concrete-syntax parser for Python or Sage input.
 *
 * Initialization is asynchronous because WebAssembly assets must be loaded,
 * but parsing itself is synchronous after construction.  Callers should make
 * one frontend per worker/session; Tree-sitter parsers retain incremental
 * parsing state and are intentionally not shared between workers.
 */
export async function createPythonSyntaxFrontend(mode: PythonSyntaxMode) {
  const parser: Parser = await createTreeSitterParser(
    `tree-sitter-${mode}.wasm`,
  );

  function parse(source: string): PythonSyntaxTree {
    const tree = parser.parse(source.endsWith("\n") ? source : `${source}\n`);
    const diagnostics: PythonSyntaxDiagnostic[] = [];
    const nodeTypes = new Set<string>();
    collect(tree.rootNode, diagnostics, nodeTypes);
    return { mode, source, tree, diagnostics, nodeTypes };
  }

  function assertValid(source: string, filename = "<input>"): PythonSyntaxTree {
    const result = parse(source);
    const error = firstSyntaxError(result.tree.rootNode);
    if (error) {
      const diagnostic = result.diagnostics.find(
        (item) => item.span.start.offset === error.startIndex,
      ) ?? {
        kind: error.isMissing ? "missing" as const : "error" as const,
        nodeType: error.type,
        text: error.text,
        span: sourceSpan(error),
      };
      throw new PythonSyntaxError(filename, diagnostic, source.length);
    }
    return result;
  }

  return {
    mode,
    parse,
    assertValid,
    close(): void {
      parser.delete();
    },
  };
}

export type PythonSyntaxFrontend = Awaited<
  ReturnType<typeof createPythonSyntaxFrontend>
>;
