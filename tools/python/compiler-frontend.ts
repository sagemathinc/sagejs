import type { PythonSyntaxMode } from "./frontend";
import { createPythonSyntaxFrontend } from "./frontend";
import { PythonModuleResolver } from "./module-resolver";

/**
 * Bridge from the authoritative Tree-sitter concrete syntax tree to the
 * existing Sage.js semantic AST pipeline.
 *
 * Tree-sitter is both the syntax authority and the AST source for ordinary
 * user programs.  Module discovery, cache loading, and recursive compilation
 * are handled by the syntax-independent TypeScript resolver; the historical
 * parser is retained only as an explicitly named bootstrap comparison path.
 */
export async function createPythonCompilerFrontend(compiler, mode: PythonSyntaxMode) {
  const syntax = await createPythonSyntaxFrontend(mode);
  const moduleSyntax = mode === "python"
    ? syntax
    : await createPythonSyntaxFrontend("python");

  return {
    mode,
    syntax,
    parse(source: string, options: Record<string, any> = {}) {
      const parsed = syntax.assertValid(source, options.filename ?? "<input>");
      return new PythonModuleResolver(compiler, moduleSyntax, {
        ...options,
        jsage: mode === "sage",
      }).lowerMain(parsed);
    },
    close(): void {
      syntax.close();
      if (moduleSyntax !== syntax) moduleSyntax.close();
    },
  };
}

export type PythonCompilerFrontend = Awaited<
  ReturnType<typeof createPythonCompilerFrontend>
>;
