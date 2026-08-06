import type { PythonSyntaxMode } from "./frontend";
import type { PythonSyntaxTree } from "./frontend";
import { createPythonSyntaxFrontend } from "./frontend";
import { PythonCstLowerer } from "./lowerer";

/**
 * Bridge from the authoritative Tree-sitter concrete syntax tree to the
 * existing Sage.js semantic AST pipeline.
 *
 * Tree-sitter is both the syntax authority and the AST source for ordinary
 * user programs.  The stage-zero parser is invoked only to finalize the
 * existing module/import shell while that bootstrap machinery is being split
 * out of the historical parser; none of its expression or statement AST is
 * retained.
 */
export async function createPythonCompilerFrontend(compiler, mode: PythonSyntaxMode) {
  const syntax = await createPythonSyntaxFrontend(mode);

  function semanticPrelude(parsed: PythonSyntaxTree): string {
    const statements: string[] = [];
    const visit = (node): void => {
      if (
        node.type === "import_statement" ||
        node.type === "import_from_statement" ||
        node.type === "future_import_statement"
      ) {
        statements.push(node.text);
        return;
      }
      if (
        node.type === "string" ||
        node.type === "concatenated_string" ||
        node.type === "comment"
      ) return;
      for (const child of node.namedChildren) visit(child);
    };
    visit(parsed.tree.rootNode);
    return statements.length ? `${statements.join("\n")}\n` : "\n";
  }

  return {
    mode,
    syntax,
    parse(source: string, options: Record<string, any> = {}) {
      const parsed = syntax.assertValid(source, options.filename ?? "<input>");
      // The bootstrap parser now sees only imports and scoped directives.  It
      // remains temporarily responsible for synchronous module discovery and
      // cache loading, but no longer parses user expressions, statements,
      // functions, or classes on the authoritative path.
      const shell = compiler.parse(semanticPrelude(parsed), options);
      return new PythonCstLowerer(compiler, parsed, {
        ...options,
        jsage: mode === "sage",
      }).lowerModule(shell).ast;
    },
    parseLegacy(source: string, options: Record<string, any> = {}) {
      return compiler.parse(source, options);
    },
    close(): void {
      syntax.close();
    },
  };
}

export type PythonCompilerFrontend = Awaited<
  ReturnType<typeof createPythonCompilerFrontend>
>;
