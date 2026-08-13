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
const { pythonExecutable } = require("../tools/python-executable.cjs");

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

function addCompilerTestRecords(records) {
  const directory = join(root, "test");
  for (const path of walk(directory, (filename) => filename.endsWith(".py"))) {
    const source = readFileSync(path, "utf8");
    if (source.includes("# DISABLED") || source.includes("# STAGE_ZERO_ONLY")) {
      continue;
    }
    records.push({
      id: relative(root, path).replaceAll("\\", "/"),
      category: "compiler-tests",
      mode: "python",
      source,
    });
  }
}

function excludedCompilerTests() {
  const excluded = { disabled: [], stageZeroOnly: [] };
  const directory = join(root, "test");
  for (const path of walk(directory, (filename) => filename.endsWith(".py"))) {
    const source = readFileSync(path, "utf8");
    const id = relative(root, path).replaceAll("\\", "/");
    if (source.includes("# DISABLED")) excluded.disabled.push(id);
    else if (source.includes("# STAGE_ZERO_ONLY")) {
      excluded.stageZeroOnly.push(id);
    }
  }
  return excluded;
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
  addCompilerTestRecords(records);
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
  const child = spawnSync(pythonExecutable(), [
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
  const {
    PythonCstLowerer,
  } = require("../dist/tools/python/lowerer.js");
  const { default: createCompiler, createBootstrapCompiler } = require(
    "../dist/tools/compiler.js"
  );
  const [python, sage] = await Promise.all([
    createPythonSyntaxFrontend("python"),
    createPythonSyntaxFrontend("sage"),
  ]);
  const compiler = createCompiler();
  const legacyCompiler = createBootstrapCompiler();
  const records = corpusRecords();
  const cpython = cpythonAcceptance(records);
  const nodeCounts = { python: {}, sage: {} };
  const details = [];
  const directById = new Map();
  const loweringGaps = new Map();
  const historicalOutputDifferences = new Map();
  const outputOptions = {
    omit_baselib: true,
    write_name: false,
    private_scope: false,
    beautify: true,
    keep_docstrings: true,
    exact_integers: true,
    python_tuples: true,
    python_truthiness: true,
    python_attributes: true,
  };

  function render(ast) {
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    return output.get();
  }

  function directShell(record, index) {
    const moduleId = `__grammar_audit_${index}`;
    return new compiler.AST_Toplevel({
      globals: undefined,
      baselib: Object.create(null),
      imports: Object.create(null),
      imported_module_ids: [],
      nonlocalvars: [],
      shebang: null,
      import_order: 0,
      module_id: moduleId,
      exports: [],
      classes: Object.create(null),
      filename: record.id,
      srchash: undefined,
      comments_after: [],
      localvars: [],
      annotated_locals: [],
      docstrings: [],
      body: [],
      start: null,
      end: null,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
    });
  }

  function recordGap(kind, id, error) {
    const gap = loweringGaps.get(kind) ?? {
      count: 0,
      examples: [],
      errors: [],
    };
    gap.count += 1;
    if (gap.examples.length < 5) gap.examples.push(id);
    if (gap.errors.length < 10 && error) {
      gap.errors.push({ id, ...errorSummary(error) });
    }
    loweringGaps.set(kind, gap);
  }

  function firstDifferingLine(left, right) {
    const leftLines = left.split("\n");
    const rightLines = right.split("\n");
    const count = Math.max(leftLines.length, rightLines.length);
    for (let index = 0; index < count; index += 1) {
      if (leftLines[index] !== rightLines[index]) {
        return {
          line: index + 1,
          legacy: (leftLines[index] ?? "<missing>").slice(0, 240),
          direct: (rightLines[index] ?? "<missing>").slice(0, 240),
        };
      }
    }
    return null;
  }

  function recordMismatch(id, legacyJavaScript, directJavaScript) {
    const difference = firstDifferingLine(legacyJavaScript, directJavaScript);
    const kind = difference
      ? `javascript-mismatch:${difference.legacy.split(/[( =.;[]/, 1)[0] || "line"}`
      : "javascript-mismatch:unknown";
    const gap = historicalOutputDifferences.get(kind) ?? {
      count: 0,
      examples: [],
      differences: [],
    };
    gap.count += 1;
    if (gap.examples.length < 5) gap.examples.push(id);
    if (gap.differences.length < 3 && difference) gap.differences.push(difference);
    historicalOutputDifferences.set(kind, gap);
  }

  try {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const frontend = record.mode === "sage" ? sage : python;
      const syntax = frontend.parse(record.source);
      const treeError = syntax.diagnostics[0] ?? null;
      for (const type of syntax.nodeTypes) {
        nodeCounts[record.mode][type] =
          (nodeCounts[record.mode][type] ?? 0) + 1;
      }
      let legacyError = null;
      let legacyAst = null;
      try {
        legacyAst = legacyCompiler.parse(record.source, {
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
      if (!treeError) {
        try {
          const direct = new PythonCstLowerer(
            compiler,
            syntax,
            {
              filename: record.id,
              module_id: `__grammar_audit_${index}`,
              for_linting: true,
              jsage: record.mode === "sage",
              exact_integer_literals: true,
              strict_python_scopes: true,
              scoped_flags: {
                dict_literals: true,
                overload_getitem: true,
                bound_methods: true,
                sequential_definitions: true,
              },
            },
          ).lowerModule(directShell(record, index));
          const directJavaScript = render(direct.ast);
          let exact = false;
          if (legacyAst) {
            const legacyJavaScript = render(legacyAst);
            exact = directJavaScript === legacyJavaScript;
            if (!exact) {
              recordMismatch(record.id, legacyJavaScript, directJavaScript);
            }
          }
          directById.set(record.id, {
            constructed: true,
            historicalCompared: Boolean(legacyAst),
            historicalExact: exact,
          });
        } catch (error) {
          const kind = error?.nodeType ?? error?.name ?? "Error";
          directById.set(record.id, {
            constructed: false,
            historicalCompared: false,
            historicalExact: false,
          });
          recordGap(kind, record.id, error);
        }
      }
      const cp = cpython.get(record.id) ?? null;
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
      directAttempted: 0,
      directConstructed: 0,
      historicalOutputCompared: 0,
      historicalOutputExact: 0,
    };
    const summary = categories[record.category];
    const detail = details.find((item) => item.id === record.id);
    summary.total += 1;
    if (!detail?.treeSitter) summary.treeSitterAccepted += 1;
    if (!detail?.legacy) summary.legacyAccepted += 1;
    const direct = directById.get(record.id);
    if (direct) {
      summary.directAttempted += 1;
      if (direct.constructed) summary.directConstructed += 1;
      if (direct.historicalCompared) summary.historicalOutputCompared += 1;
      if (direct.historicalExact) summary.historicalOutputExact += 1;
    }
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
      excludedCompilerTests: excludedCompilerTests(),
    },
    nodeCounts,
    lowering: {
      gaps: Object.fromEntries(
        [...loweringGaps.entries()].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      ),
    },
    historicalOutput: {
      differences: Object.fromEntries(
        [...historicalOutputDifferences.entries()].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      ),
    },
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
      `legacy ${category.legacyAccepted}/${category.total}; ` +
      `direct AST ${category.directConstructed}/${category.directAttempted}; ` +
      `historical JS exact ${category.historicalOutputExact}/` +
      `${category.historicalOutputCompared}` +
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
