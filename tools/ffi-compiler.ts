import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative } from "node:path";

const declarations = require("../../tools/ffi/declarations.cjs") as {
  generatePythonModule(declaration: FfiDeclaration): string;
  generatedModulePaths(root: string, declaration: FfiDeclaration): string[];
  loadRegistry(): FfiRegistry;
};
const sourceDeclarations = require(
  "../../tools/ffi/source-declarations.cjs"
) as {
  loadSourceRegistry(options?: { root?: string }): Promise<FfiSourceRegistry>;
  selectSource(registry: FfiSourceRegistry, selector?: string): FfiSource[];
};
const boundaryAudit = require("../../tools/ffi/boundary-audit.cjs") as {
  createBoundarySnapshot(options?: { root?: string }): Record<string, unknown>;
  portablePath(path: string): string;
  snapshotPath(root?: string): string;
  validateBoundarySnapshot(
    snapshot: Record<string, unknown>, options?: { root?: string },
  ): Record<string, unknown>;
};
const hostAdapters = require("../../tools/ffi/host-adapters.cjs") as {
  generatedHostAdapterPath(root: string, declaration: FfiDeclaration): string;
  generatedHostAdapterSource(declaration: FfiDeclaration): string;
  generatedHostFunctions(declaration: FfiDeclaration): FfiFunction[];
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
  sourceFilename: string | null;
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

interface FfiSource {
  filename: string;
  normalizedFilename: string;
  text: string;
  document: {
    library: { id: string };
    functions: Array<Record<string, unknown>>;
  };
  locations: Record<string, unknown>;
}

interface FfiSourceRegistry {
  root: string;
  sources: FfiSource[];
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

function repositoryPath(root: string, filename: string): string {
  return boundaryAudit.portablePath(relative(root, filename));
}

function publicDescription(
  root: string, declaration: FfiDeclaration, source?: FfiSource,
) {
  return {
    schema: "sagejs.ffi/inspection-v1",
    identity: declaration.identity,
    declaration: repositoryPath(root, declaration.filename),
    source: declaration.sourceFilename === null
      ? null : repositoryPath(root, declaration.sourceFilename),
    source_map: source?.locations ?? null,
    library: declaration.library,
    abi_catalog: {
      schema: declaration.abiCatalog.schema,
      declaration: repositoryPath(root, declaration.abiCatalog.filename),
      hash: declaration.abiCatalog.hash,
    },
    resources: declaration.resources,
    ownership_graph: declaration.ownershipGraph,
    functions: declaration.functions,
  };
}

function assertLowered(sources: FfiSource[]) {
  for (const source of sources) {
    if (!existsSync(source.normalizedFilename)) {
      throw new Error(
        `lowered FFI declaration is missing: ${source.normalizedFilename}; ` +
        "run sagejs ffi generate",
      );
    }
    if (readFileSync(source.normalizedFilename, "utf8") !== source.text) {
      throw new Error(
        `lowered FFI declaration is stale: ${source.normalizedFilename}; ` +
        "run sagejs ffi diff and sagejs ffi generate",
      );
    }
  }
}

function firstDifference(expected: string, actual: string) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expected: expectedLines[index] ?? "<end of file>",
        actual: actualLines[index] ?? "<end of file>",
      };
    }
  }
  return null;
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
    const hostPath = hostAdapters.generatedHostAdapterPath(
      registry.root, declaration,
    );
    const hostSource = hostAdapters.generatedHostAdapterSource(declaration);
    if (!existsSync(hostPath)) {
      throw new Error(`generated FFI host adapter is missing: ${hostPath}`);
    }
    if (readFileSync(hostPath, "utf8") !== hostSource) {
      throw new Error(
        `generated FFI host adapter is stale: ${hostPath}; ` +
        "run sagejs ffi generate",
      );
    }
  }
}

/** Validate, inspect, or generate explicit safe foreign-library interfaces. */
export async function runFfiCompilerCli(argv: FfiCliArguments): Promise<void> {
  const [action = "check", libraryId, ...extra] = argv.files;
  if (extra.length > 0 || ![
    "audit", "check", "diff", "emit-json", "explain", "generate",
  ].includes(action)) {
    throw new Error(
      "usage: sagejs ffi <audit|check|diff|emit-json|explain|generate> " +
      "[library|file.ffi.py] [--json] [--write]",
    );
  }
  if (argv.write && action !== "audit") {
    throw new Error("--write is only valid with sagejs ffi audit");
  }
  if (action === "audit") {
    const registry = declarations.loadRegistry();
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
  const sourceRegistry = await sourceDeclarations.loadSourceRegistry();
  const sources = sourceDeclarations.selectSource(sourceRegistry, libraryId);
  if (action === "emit-json") {
    if (sources.length !== 1) {
      throw new Error("sagejs ffi emit-json requires one library or .ffi.py file");
    }
    process.stdout.write(sources[0].text);
    return;
  }
  if (action === "diff") {
    const reports = sources.map((source) => {
      const actual = existsSync(source.normalizedFilename)
        ? readFileSync(source.normalizedFilename, "utf8") : "";
      return {
        library: source.document.library.id,
        source: repositoryPath(sourceRegistry.root, source.filename),
        lowered: repositoryPath(sourceRegistry.root, source.normalizedFilename),
        matches: actual === source.text,
        difference: firstDifference(source.text, actual),
      };
    });
    if (argv.json) {
      process.stdout.write(`${JSON.stringify(
        reports.length === 1 ? reports[0] : reports, null, 2,
      )}\n`);
    } else {
      for (const report of reports) {
        process.stdout.write(
          `${report.library}: ${report.matches ? "matches" : "differs from"} ` +
          `${report.lowered}\n`,
        );
        if (report.difference !== null) {
          process.stdout.write(
            `  first difference at line ${report.difference.line}\n` +
            `  source: ${report.difference.expected}\n` +
            `  JSON:   ${report.difference.actual}\n`,
          );
        }
      }
    }
    if (reports.some((report) => !report.matches)) process.exitCode = 1;
    return;
  }
  if (action === "generate") {
    for (const source of sources) {
      mkdirSync(dirname(source.normalizedFilename), { recursive: true });
      writeFileSync(source.normalizedFilename, source.text);
      process.stdout.write(
        `${repositoryPath(sourceRegistry.root, source.normalizedFilename)}\n`,
      );
    }
  } else {
    assertLowered(sources);
  }
  const registry = declarations.loadRegistry();
  const libraries = sources.map((source) => {
    const declaration = registry.byId.get(source.document.library.id);
    if (declaration === undefined) {
      throw new Error(`lowered FFI library is missing: ${source.document.library.id}`);
    }
    return declaration;
  });
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
        source_declarations: sources.map((item) =>
          repositoryPath(sourceRegistry.root, item.filename)),
        lowered: true,
        generated: true,
        native_boundaries: boundaryCount,
      }, null, 2)}\n`);
    } else {
      const count = libraries.reduce((sum, item) => sum + item.functions.length, 0);
      process.stdout.write(
        `Checked ${libraries.length} source declaration(s), ${count} function(s), ` +
        "deterministic JSON lowering, " +
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
        process.stdout.write(`${repositoryPath(registry.root, filename)}\n`);
      }
      const hostPath = hostAdapters.generatedHostAdapterPath(
        registry.root, declaration,
      );
      mkdirSync(dirname(hostPath), { recursive: true });
      writeFileSync(
        hostPath,
        hostAdapters.generatedHostAdapterSource(declaration),
      );
      process.stdout.write(`${repositoryPath(registry.root, hostPath)}\n`);
    }
    return;
  }
  const sourcesById = new Map(sources.map((source) =>
    [source.document.library.id, source]));
  const descriptions = libraries.map((declaration) =>
    publicDescription(
      registry.root,
      declaration,
      sourcesById.get(declaration.library.id),
    )
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
      `  source: ${description.source}\n` +
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
