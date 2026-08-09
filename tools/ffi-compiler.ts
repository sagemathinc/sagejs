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
  generatedModulePaths(root: string, declaration: FfiDeclaration): string[];
  loadRegistry(): FfiRegistry;
};
const boundaryAudit = require("../../tools/ffi/boundary-audit.cjs") as {
  createBoundarySnapshot(options?: { root?: string }): Record<string, unknown>;
  snapshotPath(root?: string): string;
  validateBoundarySnapshot(
    snapshot: Record<string, unknown>, options?: { root?: string },
  ): Record<string, unknown>;
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
  resources: Array<Record<string, unknown>>;
  ownershipGraph: Array<Record<string, unknown>>;
  functions: FfiFunction[];
  abiCatalog: {
    schema: string;
    filename: string;
    hash: string;
  };
}

interface FfiRegistry {
  root: string;
  libraries: FfiDeclaration[];
  byId: Map<string, FfiDeclaration>;
}

interface FfiCliArguments {
  files: string[];
  json?: boolean;
  write?: boolean;
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
    abi_catalog: {
      schema: declaration.abiCatalog.schema,
      declaration: relative(root, declaration.abiCatalog.filename),
      hash: declaration.abiCatalog.hash,
    },
    resources: declaration.resources,
    ownership_graph: declaration.ownershipGraph,
    functions: declaration.functions,
  };
}

function checkGenerated(registry: FfiRegistry, libraries: FfiDeclaration[]) {
  for (const declaration of libraries) {
    const expected = declarations.generatePythonModule(declaration);
    for (const filename of declarations.generatedModulePaths(
      registry.root, declaration,
    )) {
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
}

/** Validate, inspect, or generate explicit safe foreign-library interfaces. */
export async function runFfiCompilerCli(argv: FfiCliArguments): Promise<void> {
  const [action = "check", libraryId, ...extra] = argv.files;
  if (extra.length > 0 || !["audit", "check", "explain", "generate"].includes(action)) {
    throw new Error(
      "usage: sagejs ffi <audit|check|explain|generate> [library] [--json] [--write]",
    );
  }
  if (argv.write && action !== "audit") {
    throw new Error("--write is only valid with sagejs ffi audit");
  }
  const registry = declarations.loadRegistry();
  if (action === "audit") {
    if (libraryId !== undefined) throw new Error("sagejs ffi audit takes no library");
    const expected = boundaryAudit.createBoundarySnapshot({ root: registry.root });
    const filename = boundaryAudit.snapshotPath(registry.root);
    if (argv.write) {
      writeFileSync(filename, `${JSON.stringify(expected, null, 2)}\n`);
    } else {
      if (!existsSync(filename)) {
        throw new Error("native-boundary inventory is missing; run sagejs ffi audit --write");
      }
      boundaryAudit.validateBoundarySnapshot(
        JSON.parse(readFileSync(filename, "utf8")), { root: registry.root },
      );
    }
    if (argv.json) {
      process.stdout.write(`${JSON.stringify(expected, null, 2)}\n`);
    } else {
      const counts = expected.counts as Record<string, number>;
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      process.stdout.write(
        `${argv.write ? "Wrote" : "Checked"} ${total} inventoried native ` +
        `boundaries across ${Object.keys(counts).length} scopes.\n`,
      );
    }
    return;
  }
  const libraries = selected(registry, libraryId);
  if (action === "check") {
    checkGenerated(registry, libraries);
    const boundaryFilename = boundaryAudit.snapshotPath(registry.root);
    const boundarySnapshot = boundaryAudit.validateBoundarySnapshot(
      JSON.parse(readFileSync(boundaryFilename, "utf8")),
      { root: registry.root },
    );
    const boundaryCount = (
      boundarySnapshot.boundaries as Array<Record<string, unknown>>
    ).length;
    if (argv.json) {
      process.stdout.write(`${JSON.stringify({
        schema: "sagejs.ffi/check-v1",
        libraries: libraries.map((item) => item.identity),
        functions: libraries.reduce((sum, item) => sum + item.functions.length, 0),
        generated: true,
        native_boundaries: boundaryCount,
      }, null, 2)}\n`);
    } else {
      const count = libraries.reduce((sum, item) => sum + item.functions.length, 0);
      process.stdout.write(
        `Checked ${libraries.length} FFI declaration(s), ${count} function(s), ` +
        `generated safe modules, and ${boundaryCount} native boundaries.\n`,
      );
    }
    return;
  }
  if (action === "generate") {
    for (const declaration of libraries) {
      for (const filename of declarations.generatedModulePaths(
        registry.root, declaration,
      )) {
        mkdirSync(dirname(filename), { recursive: true });
        writeFileSync(filename, declarations.generatePythonModule(declaration));
        process.stdout.write(`${relative(registry.root, filename)}\n`);
      }
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
    for (const resource of description.resources as Array<{
      python_name: string;
      ownership: string;
      native: { clear_symbol: string };
    }>) {
      process.stdout.write(
        `  resource ${resource.python_name} [${resource.ownership}]; ` +
        `clear=${resource.native.clear_symbol}\n`,
      );
    }
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
