import { createHash } from "node:crypto";

import type { PythonCompilerFrontend } from "./compiler-frontend";
import { PythonCstLowerer, UnsupportedPythonCstNode } from "./lowerer";

export interface PythonFrontendDifferential {
  accepted: boolean;
  direct: boolean;
  legacyJavaScriptSha256?: string;
  directJavaScriptSha256?: string;
  sameJavaScript?: boolean;
  directlyLoweredNodeTypes: string[];
  error?: {
    name: string;
    message: string;
    line?: number;
    column?: number;
  };
}

function print(compiler, ast, outputOptions): string {
  const output = new compiler.OutputStream(outputOptions);
  ast.print(output);
  return output.get();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Compare direct CST lowering with the stage-zero AST bridge. */
export function comparePythonFrontends(
  compiler,
  frontend: PythonCompilerFrontend,
  source: string,
  parserOptions: Record<string, any>,
  outputOptions: Record<string, any>,
): PythonFrontendDifferential {
  try {
    const syntax = frontend.syntax.assertValid(
      source,
      parserOptions.filename ?? "<input>",
    );
    const legacy = frontend.parseLegacy(source, parserOptions);
    const lowerer = new PythonCstLowerer(compiler, syntax, parserOptions);
    const direct = lowerer.lowerModule(legacy);
    const legacyJavaScript = print(compiler, legacy, outputOptions);
    const directJavaScript = print(compiler, direct.ast, outputOptions);
    return {
      accepted: true,
      direct: true,
      legacyJavaScriptSha256: sha256(legacyJavaScript),
      directJavaScriptSha256: sha256(directJavaScript),
      sameJavaScript: legacyJavaScript === directJavaScript,
      directlyLoweredNodeTypes: [...direct.directlyLoweredNodeTypes].sort(),
    };
  } catch (error) {
    const value = error as any;
    return {
      accepted: !(value instanceof SyntaxError),
      direct: false,
      directlyLoweredNodeTypes: [],
      error: {
        name: value?.name ?? "Error",
        message: value?.message ?? String(value),
        line: value?.line,
        column:
          value instanceof UnsupportedPythonCstNode
            ? value.column
            : value?.col,
      },
    };
  }
}
