import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative } from "node:path";

const declarations = require("../../tools/ffi/declarations.cjs") as {
  generatePythonModule(declaration: FfiDeclaration): string;
  generatedModulePath(root: string, declaration: FfiDeclaration): string;
  loadRegistry(): FfiRegistry;
};

interface FfiFunction {
  id: string;
  python_name: string;
  signature: Record<string, unknown>;
  dynamic: Record<string, unknown>;
  native: Record<string, unknown>;
  effects: Record<string, unknown>;
  errors: Record<string, unknown>;
  targets: Record<string, unknown>;
}

interface FfiDeclaration {
  filename: string;
  hash: string;
  identity: string;
  library: {
    id: string;
    python_module: string;
    dynamic: Record<string, unknown>;
    native: Record<string, unknown>;
  };
  functions: FfiFunction[];
}

interface FfiRegistry {
  root: string;
  libraries: FfiDeclaration[];
  byId: Map<string, FfiDeclaration>;
}

interface FfiCliArguments {
  files: string[];
  json?: boolean;
}

function selected(registry: FfiRegistry, id?: string): FfiDeclaration[] {
  if (id === undefined) return registry.libraries;
  const declaration = registry.byId.get(id);
  if (declaration === undefined) throw new Error(`unknown FFI library ${id}`);
  return [declaration];
}

function publicDescription(root: string, declaration: FfiDeclaration) {
  return {
    schema: "sagejs.ffi/inspection-v1",
    identity: declaration.identity,
    declaration: relative(root, declaration.filename),
    library: declaration.library,
    functions: declaration.functions,
  };
}

function checkGenerated(registry: FfiRegistry, libraries: FfiDeclaration[]) {
  for (const declaration of libraries) {
    const filename = declarations.generatedModulePath(registry.root, declaration);
    const expected = declarations.generatePythonModule(declaration);
    if (!existsSync(filename)) {
      throw new Error(`generated FFI module is missing: ${filename}`);
    }
    if (readFileSync(filename, "utf8") !== expected) {
      throw new Error(
        `generated FFI module is stale: ${filename}; run sagejs ffi generate`,
      );
    }
  }
}

/** Validate, inspect, or generate explicit safe foreign-library interfaces. */
export async function runFfiCompilerCli(argv: FfiCliArguments): Promise<void> {
  const [action = "check", libraryId, ...extra] = argv.files;
  if (extra.length > 0 || !["check", "explain", "generate"].includes(action)) {
    throw new Error(
      "usage: sagejs ffi <check|explain|generate> [library] [--json]",
    );
  }
  const registry = declarations.loadRegistry();
  const libraries = selected(registry, libraryId);
  if (action === "check") {
    checkGenerated(registry, libraries);
    if (argv.json) {
      process.stdout.write(`${JSON.stringify({
        schema: "sagejs.ffi/check-v1",
        libraries: libraries.map((item) => item.identity),
        functions: libraries.reduce((sum, item) => sum + item.functions.length, 0),
        generated: true,
      }, null, 2)}\n`);
    } else {
      const count = libraries.reduce((sum, item) => sum + item.functions.length, 0);
      process.stdout.write(
        `Checked ${libraries.length} FFI declaration(s), ${count} function(s), ` +
        "and generated safe modules.\n",
      );
    }
    return;
  }
  if (action === "generate") {
    for (const declaration of libraries) {
      const filename = declarations.generatedModulePath(registry.root, declaration);
      mkdirSync(dirname(filename), { recursive: true });
      writeFileSync(filename, declarations.generatePythonModule(declaration));
      process.stdout.write(`${relative(registry.root, filename)}\n`);
    }
    return;
  }
  const descriptions = libraries.map((declaration) =>
    publicDescription(registry.root, declaration)
  );
  if (argv.json) {
    process.stdout.write(`${JSON.stringify(
      descriptions.length === 1 ? descriptions[0] : descriptions,
      null,
      2,
    )}\n`);
    return;
  }
  for (const description of descriptions) {
    process.stdout.write(
      `${description.identity}\n` +
      `  declaration: ${description.declaration}\n` +
      `  Python: ${description.library.python_module}\n` +
      `  dynamic: ${(description.library.dynamic as { package: string }).package}\n`,
    );
    for (const fn of description.functions as FfiFunction[]) {
      const signature = fn.signature as {
        parameters: Array<{ name: string; type: string; ownership: string }>;
        return_type: string;
        return_ownership: string;
      };
      process.stdout.write(
        `  ${fn.python_name}(` +
        signature.parameters.map((param) =>
          `${param.name}: ${param.type} [${param.ownership}]`
        ).join(", ") +
        `) -> ${signature.return_type} [${signature.return_ownership}]\n` +
        `    C: ${(fn.native as { symbol: string }).symbol}; ` +
        `effects=${JSON.stringify(fn.effects)}\n`,
      );
    }
  }
}
