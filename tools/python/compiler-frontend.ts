import type { PythonSyntaxMode } from "./frontend";
import { createPythonSyntaxFrontend } from "./frontend";

/**
 * Bridge from the authoritative Tree-sitter concrete syntax tree to the
 * existing Sage.js semantic AST pipeline.
 *
 * During the migration, the mature parser remains the AST constructor after
 * Tree-sitter has accepted the source.  Keeping this bridge explicit makes it
 * impossible for user-facing call sites to silently bypass the new grammar,
 * while allowing CST node families to move to direct lowering one at a time.
 */
export async function createPythonCompilerFrontend(compiler, mode: PythonSyntaxMode) {
  const syntax = await createPythonSyntaxFrontend(mode);

  return {
    mode,
    syntax,
    parse(source: string, options: Record<string, any> = {}) {
      syntax.assertValid(source, options.filename ?? "<input>");
      return compiler.parse(source, options);
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
