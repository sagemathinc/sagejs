#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { join, relative } = require("node:path");

const root = join(__dirname, "..");
const baselinePath = join(root, "audits", "python-grammar.json");

function usage() {
  console.log(`Usage: node scripts/audit-python-grammar.cjs [options]

Audit Python and Sage syntax corpora with Tree-sitter, the stage-zero parser,
and CPython. The JSON report is deterministic and suitable for CI diffs.

Options:
  --check          fail if the report differs from audits/python-grammar.json
  --write          replace audits/python-grammar.json
  --json           print the complete report instead of the human summary
  --help           show this help`);
}

function parseArguments(argv) {
  const options = { check: false, write: false, json: false };
  for (const argument of argv) {
    if (argument === "--check") options.check = true;
    else if (argument === "--write") options.write = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.check && options.write) {
    throw new Error("--check and --write are mutually exclusive");
  }
  return options;
}

function walk(directory, predicate, result = []) {
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, predicate, result);
    else if (predicate(path)) result.push(path);
  }
  return result;
}

function addFileRecords(records, directory, mode, category, predicate) {
  for (const path of walk(directory, predicate)) {
    records.push({
      id: relative(root, path).replaceAll("\\", "/"),
      category,
      mode,
      source: readFileSync(path, "utf8"),
    });
  }
}

function addDoctestRecords(records) {
  for (const path of walk(
    join(root, "upstream-tests"),
    (filename) => filename.endsWith(".doctests.json"),
  )) {
    const document = JSON.parse(readFileSync(path, "utf8"));
    for (const group of document.groups ?? []) {
      for (const example of group.examples ?? []) {
        records.push({
          id: `doctest:${example.id}`,
          category: "sage-doctests",
          mode: "sage",
          source: example.source,
        });
      }
    }
  }
}

function addPcimcRecords(records) {
  const path = join(root, "upstream-tests", "pcimc", "cells.json");
  if (!existsSync(path)) return;
  const document = JSON.parse(readFileSync(path, "utf8"));
  for (const owner of document.documents ?? []) {
    for (const cell of owner.cells ?? []) {
      if (cell.classification !== "executable") continue;
      let source = cell.source;
      let mode = "sage";
      const magic = source.match(/^%%([A-Za-z0-9_+-]+)[^\n]*\n?/);
      if (magic) {
        if (magic[1] !== "python" && magic[1] !== "python3") continue;
        source = source.slice(magic[0].length);
        mode = "python";
      }
      records.push({
        id: `pcimc:${cell.id}`,
        category: "pcimc-book",
        mode,
        source,
      });
    }
  }
}

function corpusRecords() {
  const records = [];
  for (const name of readdirSync(join(root, "src")).sort()) {
    const path = join(root, "src", name);
    if (!name.endsWith(".py") || !statSync(path).isFile()) continue;
    records.push({
      id: relative(root, path).replaceAll("\\", "/"),
      category: "compiler-self-hosting",
      mode: "python",
      source: readFileSync(path, "utf8"),
    });
  }
  addFileRecords(
    records,
    join(root, "src", "lib"),
    "python",
    "legacy-stdlib",
    (path) => path.endsWith(".py"),
  );
  addFileRecords(
    records,
    join(root, "src", "baselib"),
    "python",
    "strict-baselib",
    (path) => path.endsWith(".py"),
  );
  addFileRecords(
    records,
    join(root, "upstream-tests", "micropython", "basics"),
    "python",
    "micropython",
    (path) => path.endsWith(".py"),
  );
  addFileRecords(
    records,
    join(root, "bench"),
    "sage",
    "sage-programs",
    (path) => path.endsWith(".sage"),
  );
  addFileRecords(
    records,
    join(root, "packages"),
    "sage",
    "sage-programs",
    (path) => path.endsWith(".sage"),
  );
  addDoctestRecords(records);
  addPcimcRecords(records);
  return records.sort((left, right) => left.id.localeCompare(right.id));
}

function cpythonAcceptance(records) {
  const pythonRecords = records.filter((record) => record.mode === "python");
  const program = String.raw`
import json, sys
for line in sys.stdin:
    item = json.loads(line)
    try:
        compile(item["source"], item["id"], "exec")
        result = {"id": item["id"], "accepted": True}
    except (SyntaxError, ValueError, TypeError) as error:
        result = {
            "id": item["id"],
            "accepted": False,
            "error": type(error).__name__,
            "line": getattr(error, "lineno", None),
            "column": getattr(error, "offset", None),
        }
    print(json.dumps(result, sort_keys=True))
`;
  const input = pythonRecords
    .map((record) => JSON.stringify({ id: record.id, source: record.source }))
    .join("\n");
  const child = spawnSync(process.env.SAGEJS_REFERENCE_PYTHON || "python3", [
    "-c",
    program,
  ], {
    cwd: root,
    input: `${input}\n`,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(child.stderr || child.stdout);
  return new Map(
    child.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const value = JSON.parse(line);
      return [value.id, value];
    }),
  );
}

function errorSummary(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error).split("\n")[0],
    line: error?.line ?? null,
    column: error?.col ?? null,
  };
}

async function createReport() {
  const { createPythonSyntaxFrontend } = require(
    "../dist/tools/python/frontend.js"
  );
  const createCompiler = require("../dist/tools/compiler.js").default;
  const [python, sage] = await Promise.all([
    createPythonSyntaxFrontend("python"),
    createPythonSyntaxFrontend("sage"),
  ]);
  const compiler = createCompiler();
  const records = corpusRecords();
  const cpython = cpythonAcceptance(records);
  const nodeCounts = { python: {}, sage: {} };
  const details = [];

  try {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const frontend = record.mode === "sage" ? sage : python;
      const syntax = frontend.parse(record.source);
      for (const type of syntax.nodeTypes) {
        nodeCounts[record.mode][type] =
          (nodeCounts[record.mode][type] ?? 0) + 1;
      }
      let legacyError = null;
      try {
        compiler.parse(record.source, {
          filename: record.id,
          module_id: `__grammar_audit_${index}`,
          for_linting: true,
          import_dirs: [],
          imported_modules: {},
          importing_modules: {},
          jsage: record.mode === "sage",
          exact_integer_literals: true,
          strict_python_scopes: true,
          scoped_flags: {
            dict_literals: true,
            overload_getitem: true,
            bound_methods: true,
            sequential_definitions: true,
          },
        });
      } catch (error) {
        legacyError = errorSummary(error);
      }
      const cp = cpython.get(record.id) ?? null;
      const treeError = syntax.diagnostics[0] ?? null;
      if (treeError || legacyError || (cp && !cp.accepted)) {
        details.push({
          id: record.id,
          category: record.category,
          mode: record.mode,
          treeSitter: treeError,
          legacy: legacyError,
          cpython: cp?.accepted ? null : cp,
        });
      }
    }
  } finally {
    python.close();
    sage.close();
  }

  const categories = {};
  for (const record of records) {
    categories[record.category] ??= {
      total: 0,
      treeSitterAccepted: 0,
      legacyAccepted: 0,
      cpythonAccepted: 0,
      cpythonApplicable: 0,
    };
    const summary = categories[record.category];
    const detail = details.find((item) => item.id === record.id);
    summary.total += 1;
    if (!detail?.treeSitter) summary.treeSitterAccepted += 1;
    if (!detail?.legacy) summary.legacyAccepted += 1;
    const cp = cpython.get(record.id);
    if (cp) {
      summary.cpythonApplicable += 1;
      if (cp.accepted) summary.cpythonAccepted += 1;
    }
  }

  for (const mode of ["python", "sage"]) {
    nodeCounts[mode] = Object.fromEntries(
      Object.entries(nodeCounts[mode]).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    );
  }
  return {
    schema: "sagejs.python-grammar-audit/v1",
    grammar: {
      python: "tree-sitter-python@0.25.0",
      sage: "tools/tree-sitter-sage",
    },
    summary: {
      records: records.length,
      categories,
      distinctNodeTypes: {
        python: Object.keys(nodeCounts.python).length,
        sage: Object.keys(nodeCounts.sage).length,
      },
      discrepancies: details.length,
    },
    nodeCounts,
    discrepancies: details,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await createReport();
  const serialized = stableJson(report);
  if (options.write) writeFileSync(baselinePath, serialized);
  if (options.check) {
    const expected = readFileSync(baselinePath, "utf8");
    if (expected !== serialized) {
      console.error(
        "Python grammar audit changed; run pnpm python:grammar:audit --write and review the diff",
      );
      process.exitCode = 1;
    }
  }
  if (options.json) {
    process.stdout.write(serialized);
    return;
  }
  console.log(`Python/Sage grammar audit: ${report.summary.records} inputs`);
  for (const [name, category] of Object.entries(report.summary.categories)) {
    console.log(
      `  ${name}: Tree-sitter ${category.treeSitterAccepted}/${category.total}; ` +
      `legacy ${category.legacyAccepted}/${category.total}` +
      (category.cpythonApplicable
        ? `; CPython ${category.cpythonAccepted}/${category.cpythonApplicable}`
        : ""),
    );
  }
  console.log(
    `  grammar nodes: Python ${report.summary.distinctNodeTypes.python}; ` +
    `Sage ${report.summary.distinctNodeTypes.sage}`,
  );
  console.log(`  discrepancy records: ${report.summary.discrepancies}`);
}

void main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
