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
      diagnostic.nodeType === "indentation"
        ? `${filename}:${line}:${column}: Inconsistent indentation`
        : diagnostic.text.includes("(") && diagnostic.text.trimEnd().endsWith("=")
        ? `${filename}:${line}:${column}: cannot assign to a function call`
        : `${filename}:${line}:${column}: Unexpected token: ${
          diagnostic.text || diagnostic.nodeType
        }`,
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

function effectiveIndent(source: string, node: SyntaxNode): number {
  const lineStart = source.lastIndexOf("\n", Math.max(0, node.startIndex - 1)) + 1;
  const prefix = source.slice(lineStart, node.startIndex);
  let column = 0;
  for (const character of prefix) {
    if (character === " ") column += 1;
    else if (character === "\t") column += 8 - (column % 8);
    else if (character === "\f") column = 0;
  }
  return column;
}

/**
 * Tree-sitter intentionally recovers an unexpected indent by treating the
 * following line as a new statement.  That is useful in an editor, but a
 * compiler must reject the same source as CPython.  Validate the statement
 * columns represented by each module/block while still allowing multiple
 * statements on one physical line (``a; b``).
 */
function firstIndentationError(
  source: string,
  node: SyntaxNode,
): SyntaxNode | null {
  if (node.type === "module" || node.type === "block") {
    const firstByRow = new Map<number, SyntaxNode>();
    for (const child of node.namedChildren) {
      if (child.type === "comment" || child.isError || child.isMissing) continue;
      if (!firstByRow.has(child.startPosition.row)) {
        firstByRow.set(child.startPosition.row, child);
      }
    }
    const statements = [...firstByRow.values()];
    if (statements.length) {
      const expected = node.type === "module"
        ? 0
        : effectiveIndent(source, statements[0]);
      for (const statement of statements) {
        if (effectiveIndent(source, statement) !== expected) return statement;
      }
    }
  }
  for (const child of node.namedChildren) {
    const error = firstIndentationError(source, child);
    if (error) return error;
  }
  return null;
}

/**
 * Tree-sitter represents a compound statement ending at its colon as a valid
 * node with an empty ``block``.  That recovery is convenient while editing,
 * but Python requires at least one statement in every suite.  In particular,
 * Jupyter relies on the resulting EOF diagnostic to request another line.
 */
function firstEmptyBlock(node: SyntaxNode): SyntaxNode | null {
  if (
    node.type === "block" &&
    !node.namedChildren.some((child) => child.type !== "comment")
  ) {
    return node;
  }
  for (const child of node.namedChildren) {
    const empty = firstEmptyBlock(child);
    if (empty) return empty;
  }
  return null;
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
    // CPython performs universal-newline translation before tokenization.
    // Tree-sitter's external scanner expects LF, so normalize here rather
    // than letting CR-only files collapse into a single comment/token.
    const normalizedSource = source.replace(/\r\n?/g, "\n");
    const tree = parser.parse(
      normalizedSource.endsWith("\n")
        ? normalizedSource
        : `${normalizedSource}\n`,
    );
    const diagnostics: PythonSyntaxDiagnostic[] = [];
    const nodeTypes = new Set<string>();
    collect(tree.rootNode, diagnostics, nodeTypes);
    return { mode, source: normalizedSource, tree, diagnostics, nodeTypes };
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
      throw new PythonSyntaxError(filename, diagnostic, result.source.length);
    }
    const emptyBlock = firstEmptyBlock(result.tree.rootNode);
    if (emptyBlock) {
      throw new PythonSyntaxError(filename, {
        kind: "missing",
        nodeType: "block",
        text: "",
        span: sourceSpan(emptyBlock),
      }, result.source.length);
    }
    const indentationError = firstIndentationError(
      result.source,
      result.tree.rootNode,
    );
    if (indentationError) {
      throw new PythonSyntaxError(filename, {
        kind: "error",
        nodeType: "indentation",
        text: indentationError.text,
        span: sourceSpan(indentationError),
      }, result.source.length);
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
