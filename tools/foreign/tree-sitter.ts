import {
  Language,
  Node as SyntaxNode,
  Parser,
} from "web-tree-sitter";
import {
  readResourceBytes,
  vendorResourcePath,
} from "../resources";

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

const CORE_WASM = "web-tree-sitter.wasm";
let initialization: Promise<void> | undefined;

export async function createTreeSitterParser(
  languageAsset: string,
): Promise<Parser> {
  initialization ??= Parser.init({
    wasmBinary: readResourceBytes(vendorResourcePath(CORE_WASM)),
  });
  await initialization;
  const language = await Language.load(
    readResourceBytes(vendorResourcePath(languageAsset)),
  );
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

export function sourceSpan(node: SyntaxNode): SourceSpan {
  return {
    start: {
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      offset: node.startIndex,
    },
    end: {
      line: node.endPosition.row + 1,
      column: node.endPosition.column + 1,
      offset: node.endIndex,
    },
  };
}

export function firstSyntaxError(
  node: SyntaxNode,
): SyntaxNode | undefined {
  if (node.isError || node.isMissing) return node;
  for (const child of node.children) {
    const found = firstSyntaxError(child);
    if (found) return found;
  }
}
