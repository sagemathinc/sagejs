#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const domains = ["ZZ", "QQ", "GF2", "GF7", "GFWORD"];
const expectedOperations = [
  "construct_range",
  "construct_random",
  "add",
  "subtract",
  "multiply",
  "transpose",
  "swap_rows",
  "swap_columns",
  "rank",
  "rref",
  "determinant",
  "charpoly",
  "solve_right",
  "right_kernel",
];

function parseArguments(argv) {
  const options = {
    mode: "routine",
    runtime: undefined,
    check: false,
    compact: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--quick") options.mode = "quick";
    else if (argument === "--full") options.mode = "full";
    else if (argument === "--check") options.check = true;
    else if (argument === "--json") options.compact = true;
    else if (argument === "--runtime") {
      options.runtime = argv[index + 1];
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(`Usage: node bench/dense-matrix-public-audit.cjs [options]

  --quick             Small correctness/audit workload suitable for a focused check
  --full              Larger workload and SageMath comparison when Sage is available
  --runtime VALUE     sagejs, sage, or all (default: sagejs; full default: all)
  --check             Fail on semantic, process, coverage, or trace-classification gaps
  --json              Emit compact rather than indented JSON
`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (options.runtime === undefined) {
    options.runtime = options.mode === "full" ? "all" : "sagejs";
  }
  if (!new Set(["quick", "routine", "full"]).has(options.mode)) {
    throw new Error(`invalid mode: ${options.mode}`);
  }
  if (!new Set(["sagejs", "sage", "all"]).has(options.runtime)) {
    throw new Error(`invalid runtime: ${options.runtime}`);
  }
  return options;
}

function profile(mode, domain) {
  const profiles = {
    quick: {
      samples: 2,
      constructRows: 24,
      constructColumns: 31,
      linear: 28,
      multiply: 18,
      swapsRows: 29,
      swapsColumns: 33,
      algorithm: 12,
      charpoly: 8,
      solve: 10,
      solveColumns: 3,
      kernelRows: 10,
      kernelColumns: 14,
    },
    routine: {
      samples: 3,
      constructRows: 140,
      constructColumns: 180,
      linear: 180,
      multiply: { ZZ: 90, QQ: 80, GF2: 220, GF7: 160, GFWORD: 120 }[domain],
      swapsRows: 220,
      swapsColumns: 240,
      algorithm: { ZZ: 55, QQ: 45, GF2: 150, GF7: 110, GFWORD: 85 }[domain],
      charpoly: { ZZ: 30, QQ: 25, GF2: 80, GF7: 70, GFWORD: 55 }[domain],
      solve: { ZZ: 45, QQ: 40, GF2: 100, GF7: 85, GFWORD: 70 }[domain],
      solveColumns: 8,
      kernelRows: { ZZ: 45, QQ: 40, GF2: 120, GF7: 95, GFWORD: 75 }[domain],
      kernelColumns: { ZZ: 65, QQ: 60, GF2: 170, GF7: 135, GFWORD: 105 }[domain],
    },
    full: {
      samples: 5,
      constructRows: 500,
      constructColumns: 700,
      linear: 500,
      multiply: { ZZ: 220, QQ: 200, GF2: 700, GF7: 300, GFWORD: 240 }[domain],
      swapsRows: 700,
      swapsColumns: 900,
      algorithm: { ZZ: 140, QQ: 120, GF2: 350, GF7: 250, GFWORD: 180 }[domain],
      charpoly: { ZZ: 75, QQ: 60, GF2: 160, GF7: 130, GFWORD: 100 }[domain],
      solve: { ZZ: 110, QQ: 100, GF2: 240, GF7: 180, GFWORD: 140 }[domain],
      solveColumns: 16,
      kernelRows: { ZZ: 120, QQ: 100, GF2: 250, GF7: 200, GFWORD: 150 }[domain],
      kernelColumns: { ZZ: 170, QQ: 150, GF2: 360, GF7: 290, GFWORD: 220 }[domain],
    },
  };
  return profiles[mode];
}

function domainSource(domain) {
  switch (domain) {
    case "ZZ":
      return String.raw`
_base = ZZ
def _value(index):
    return ZZ((37 * index + 19 * index * index + 11) % 101 - 50)
`;
    case "QQ":
      return String.raw`
_base = QQ
def _value(index):
    return QQ((37 * index + 19 * index * index + 11) % 101 - 50) / (index % 7 + 1)
`;
    case "GF2":
      return String.raw`
_base = GF(2)
def _value(index):
    return _base((index * index + 3 * index + index // 3 + 1) % 2)
`;
    case "GF7":
      return String.raw`
_base = GF(7)
def _value(index):
    return _base((37 * index + 19 * index * index + 11) % 7)
`;
    case "GFWORD":
      return String.raw`
_base = GF(2305843009213693951)
def _value(index):
    return _base((1000003 * index * index + 1000033 * index + 97) % 2305843009213693951)
`;
    default:
      throw new Error(`unknown domain: ${domain}`);
  }
}

function measurementScope(operation) {
  if (new Set([
    "rank",
    "rref",
    "determinant",
    "charpoly",
    "solve_right",
    "right_kernel",
  ]).has(operation)) {
    return "copy-plus-operation-on-fixed-source";
  }
  if (operation === "swap_rows" || operation === "swap_columns") {
    return "copy-plus-mutating-operation-on-fixed-source";
  }
  if (operation === "construct_random") {
    return "runtime-local-random-construction";
  }
  return "operation-on-fixed-source";
}

function benchmarkSource(runtime, domain, settings) {
  const preamble = runtime === "sage"
    ? "from sage.all import *\nimport time"
    : "import time";
  return String.raw`${preamble}

_audit_script_started = time.perf_counter()
${domainSource(domain)}
_samples = ${settings.samples}
_construct_rows = ${settings.constructRows}
_construct_columns = ${settings.constructColumns}
_linear_size = ${settings.linear}
_multiply_size = ${settings.multiply}
_swap_rows = ${settings.swapsRows}
_swap_columns = ${settings.swapsColumns}
_algorithm_size = ${settings.algorithm}
_charpoly_size = ${settings.charpoly}
_solve_size = ${settings.solve}
_solve_columns = ${settings.solveColumns}
_kernel_rows = ${settings.kernelRows}
_kernel_columns = ${settings.kernelColumns}

def _median(values):
    values.sort()
    return values[len(values) // 2]

def _timed_invoke(label, sample, function):
    print("AUDIT_TRACE_BEGIN|" + label + "|" + sample)
    started = time.perf_counter()
    try:
        result = function()
        elapsed_ms = 1000 * (time.perf_counter() - started)
    finally:
        print("AUDIT_TRACE_END|" + label + "|" + sample)
    return result, elapsed_ms

def _measure(label, function, verify):
    print("AUDIT_CASE|" + label)
    try:
        result, first_measured_ms = _timed_invoke(label, "first", function)
        verify(result)
        samples = []
        for _sample in range(_samples):
            result, elapsed_ms = _timed_invoke(
                label, "warm-" + str(_sample), function
            )
            samples.append(elapsed_ms)
            verify(result)
        print(
            "AUDIT_RESULT|" + label + "|" + str(first_measured_ms) + "|" +
            str(_median(samples)) + "|" + str(min(samples)) + "|" +
            str(max(samples)) + "|verified"
        )
    except Exception as error:
        status = "unsupported" if isinstance(error, NotImplementedError) else "error"
        detail = str(error).replace("|", "/").replace("\n", " ")
        print(
            "AUDIT_FAILURE|" + label + "|" + status + "|" +
            type(error).__name__ + "|" + detail
        )

def _dense(rows, columns, offset=0):
    return matrix(
        _base, rows, columns,
        [_value(offset + row * columns + column)
         for row in range(rows) for column in range(columns)],
    )

def _unit_upper(size):
    return matrix(
        _base, size, size,
        [(_base(1) if row == column else
          (_value(17 + row * size + column) if column > row else _base(0)))
         for row in range(size) for column in range(size)],
    )

def _unit_lower(size):
    return matrix(
        _base, size, size,
        [(_base(1) if row == column else
          (_value(700003 + row * size + column) if row > column else _base(0)))
         for row in range(size) for column in range(size)],
    )

def _verify_range(result):
    assert result.dimensions() == (_construct_rows, _construct_columns)
    assert result.base_ring() == _base
    assert result[0, 0] == _base(0)
    assert result[_construct_rows - 1, _construct_columns - 1] == _base(
        _construct_rows * _construct_columns - 1
    )

def _verify_random(result):
    assert result.dimensions() == (_construct_rows, _construct_columns)
    assert result.base_ring() == _base
    entries = result.list()
    assert len(entries) == _construct_rows * _construct_columns
    assert matrix(_base, _construct_rows, _construct_columns, entries) == result
    nonzero = 0
    differs_from_first = False
    first = entries[0]
    for entry in entries:
        assert entry == _base(entry)
        if entry != _base(0):
            nonzero += 1
        if entry != first:
            differs_from_first = True
    assert nonzero > 0
    assert differs_from_first

set_random_seed(20260812)
_measure(
    "construct_range",
    lambda: matrix(
        _base, _construct_rows, _construct_columns,
        range(_construct_rows * _construct_columns),
    ),
    _verify_range,
)
_measure(
    "construct_random",
    lambda: random_matrix(_base, _construct_rows, _construct_columns),
    _verify_random,
)

_left = _dense(_linear_size, _linear_size, 3)
_right = _dense(_linear_size, _linear_size, 1000003)

def _verify_add(result):
    assert result.dimensions() == _left.dimensions()
    for row, column in [(0, 0), (_linear_size // 2, _linear_size // 3), (_linear_size - 1, _linear_size - 1)]:
        assert result[row, column] == _left[row, column] + _right[row, column]

def _verify_subtract(result):
    assert result.dimensions() == _left.dimensions()
    for row, column in [(0, 0), (_linear_size // 2, _linear_size // 3), (_linear_size - 1, _linear_size - 1)]:
        assert result[row, column] == _left[row, column] - _right[row, column]

_measure("add", lambda: _left + _right, _verify_add)
_measure("subtract", lambda: _left - _right, _verify_subtract)

_multiply_left = _dense(_multiply_size, _multiply_size, 7)
_multiply_right = _dense(_multiply_size, _multiply_size, 700001)

def _verify_multiply(result):
    assert result.dimensions() == (_multiply_size, _multiply_size)
    for row, column in [(0, 0), (_multiply_size // 2, _multiply_size // 3), (_multiply_size - 1, _multiply_size - 1)]:
        expected = sum(
            _multiply_left[row, inner] * _multiply_right[inner, column]
            for inner in range(_multiply_size)
        )
        assert result[row, column] == expected

_measure("multiply", lambda: _multiply_left * _multiply_right, _verify_multiply)

def _verify_transpose(result):
    assert result.dimensions() == (_left.ncols(), _left.nrows())
    for row, column in [(0, 0), (_linear_size // 2, _linear_size // 3), (_linear_size - 1, _linear_size - 1)]:
        assert result[column, row] == _left[row, column]

_measure("transpose", _left.transpose, _verify_transpose)

_swap_source = _dense(_swap_rows, _swap_columns, 170003)

def _do_swap_rows():
    result = _swap_source.__copy__()
    result.swap_rows(0, _swap_rows - 1)
    return result

def _verify_swap_rows(result):
    for column in [0, _swap_columns // 2, _swap_columns - 1]:
        assert result[0, column] == _swap_source[_swap_rows - 1, column]
        assert result[_swap_rows - 1, column] == _swap_source[0, column]

def _do_swap_columns():
    result = _swap_source.__copy__()
    result.swap_columns(0, _swap_columns - 1)
    return result

def _verify_swap_columns(result):
    for row in [0, _swap_rows // 2, _swap_rows - 1]:
        assert result[row, 0] == _swap_source[row, _swap_columns - 1]
        assert result[row, _swap_columns - 1] == _swap_source[row, 0]

_measure("swap_rows", _do_swap_rows, _verify_swap_rows)
_measure("swap_columns", _do_swap_columns, _verify_swap_columns)

_algorithm_source = _unit_lower(_algorithm_size) * _unit_upper(_algorithm_size)

def _verify_rank(result):
    assert result == _algorithm_size

def _verify_rref(result):
    assert result == identity_matrix(result.base_ring(), _algorithm_size)

def _verify_determinant(result):
    assert result == _base(1)

_measure("rank", lambda: _algorithm_source.__copy__().rank(), _verify_rank)
_measure("rref", lambda: _algorithm_source.__copy__().rref(), _verify_rref)
_measure("determinant", lambda: _algorithm_source.__copy__().det(), _verify_determinant)

_charpoly_upper = _unit_upper(_charpoly_size)
_charpoly_change = matrix(
    _base, _charpoly_size, _charpoly_size,
    [(_base(1) if row == column else
      (_value(800003 + row) if column == 0 else _base(0)))
     for row in range(_charpoly_size) for column in range(_charpoly_size)],
)
_charpoly_change_inverse = matrix(
    _base, _charpoly_size, _charpoly_size,
    [(_base(1) if row == column else
      (-_value(800003 + row) if column == 0 else _base(0)))
     for row in range(_charpoly_size) for column in range(_charpoly_size)],
)
_charpoly_source = _charpoly_change * _charpoly_upper * _charpoly_change_inverse

def _verify_charpoly(result):
    generator = result.parent().gen()
    assert result == (generator - _base(1)) ** _charpoly_size

_measure("charpoly", lambda: _charpoly_source.__copy__().charpoly(), _verify_charpoly)

_solve_left = _unit_upper(_solve_size)
_solve_expected = _dense(_solve_size, _solve_columns, 900001)
_solve_right = _solve_left * _solve_expected

def _verify_solve(result):
    assert result == _solve_expected
    assert _solve_left * result == _solve_right

_measure(
    "solve_right",
    lambda: _solve_left.__copy__().solve_right(_solve_right),
    _verify_solve,
)

_kernel_source = matrix(
    _base, _kernel_rows, _kernel_columns,
    [(_base(1) if column == row else
      (_base(0) if column < _kernel_rows else
       _value(1200001 + row * _kernel_columns + column)))
     for row in range(_kernel_rows) for column in range(_kernel_columns)],
)

def _verify_kernel(result):
    assert result.dimensions() == (
        _kernel_columns - _kernel_rows, _kernel_columns
    )
    assert _kernel_source * result.transpose() == zero_matrix(
        _base, _kernel_rows, result.nrows()
    )

_measure(
    "right_kernel",
    lambda: _kernel_source.__copy__().right_kernel_matrix(),
    _verify_kernel,
)
print("AUDIT_SCRIPT_MS|" + str(1000 * (time.perf_counter() - _audit_script_started)))
`;
}

function findSage() {
  if (process.env.SAGEJS_MATRIX_AUDIT_DISABLE_SAGE === "1") return undefined;
  const candidates = [
    process.env.SAGE,
    "sagelite",
    "sage",
    "/opt/cocalc-webdev-python/bin/sage",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (!result.error && result.status === 0) return candidate;
  }
  return undefined;
}

function parseOutput(stdout) {
  const routes = new Map();
  const cases = [];
  let traceWindow;
  let scriptMs;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("AUDIT_TRACE_BEGIN|")) {
      const [, operation, sample] = line.split("|");
      assert.equal(traceWindow, undefined, "nested audit trace window");
      traceWindow = { operation, sample };
      if (!routes.has(operation)) routes.set(operation, new Set());
      continue;
    }
    if (line.startsWith("AUDIT_TRACE_END|")) {
      const [, operation, sample] = line.split("|");
      assert.deepEqual(
        traceWindow,
        { operation, sample },
        "mismatched audit trace window",
      );
      traceWindow = undefined;
      continue;
    }
    if (line.startsWith("AUDIT_RESULT|")) {
      const [, operation, firstMeasured, warm, minimum, maximum, witness] = line.split("|");
      cases.push({
        operation,
        first_measured_ms: Number(firstMeasured),
        warm_median_ms: Number(warm),
        warm_min_ms: Number(minimum),
        warm_max_ms: Number(maximum),
        witness,
        timed_scope: measurementScope(operation),
        comparable_input: operation !== "construct_random",
      });
      continue;
    }
    if (line.startsWith("AUDIT_FAILURE|")) {
      const [, operation, status, exception, detail] = line.split("|");
      cases.push({
        operation,
        status,
        exception,
        detail,
        timed_scope: measurementScope(operation),
        comparable_input: operation !== "construct_random",
      });
      continue;
    }
    if (line.startsWith("AUDIT_SCRIPT_MS|")) {
      scriptMs = Number(line.slice("AUDIT_SCRIPT_MS|".length));
      continue;
    }
    const trace = line.match(/^\[sagejs native\] (Matrix\.[^ ]+).* -> ([^ ]+)$/);
    if (trace && traceWindow !== undefined) {
      routes.get(traceWindow.operation).add(`${trace[1]}:${trace[2]}`);
    }
  }
  assert.equal(traceWindow, undefined, "unterminated audit trace window");
  for (const item of cases) {
    item.backends = [...(routes.get(item.operation) ?? [])].sort();
  }
  return { cases, scriptMs };
}

function runDomain(runtime, domain, mode, sageCommand) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-audit-"));
  try {
    const filename = join(directory, `${runtime}-${domain}.py`);
    writeFileSync(filename, benchmarkSource(runtime, domain, profile(mode, domain)));
    const command = runtime === "sagejs"
      ? [process.execPath, join(root, "bin", "sagejs"), "--python", filename]
      : [sageCommand, filename];
    const started = performance.now();
    const result = spawnSync(command[0], command.slice(1), {
      cwd: root,
      encoding: "utf8",
      timeout: mode === "full" ? 900_000 : 300_000,
      env: {
        ...process.env,
        OPENBLAS_NUM_THREADS: "1",
        OMP_NUM_THREADS: "1",
        SAGE_NUM_THREADS: "1",
        SAGEJS_NATIVE_TRACE: runtime === "sagejs" ? "1" : "0",
        SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      },
    });
    const processMs = performance.now() - started;
    if (result.error || result.status !== 0) {
      return {
        domain,
        ok: false,
        fresh_process_ms: processMs,
        error: result.error?.message ?? `process exited with status ${result.status}`,
        stdout_tail: result.stdout.slice(-4000),
        stderr_tail: result.stderr.slice(-4000),
      };
    }
    const parsed = parseOutput(result.stdout);
    const capabilityHoles = parsed.cases
      .filter((item) => item.status === "unsupported")
      .map((item) => item.operation);
    return {
      domain,
      ok: true,
      fresh_process_ms: processMs,
      script_ms: parsed.scriptMs,
      runtime_bootstrap_estimate_ms: Math.max(0, processMs - parsed.scriptMs),
      audited_operations: parsed.cases.length,
      verified_operations: parsed.cases.length - capabilityHoles.length,
      capability_holes: capabilityHoles,
      cases: parsed.cases,
      stderr: result.stderr.trim() || undefined,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function compareRuntimes(runtimeReports) {
  const sagejs = runtimeReports.sagejs ?? [];
  const sage = runtimeReports.sage ?? [];
  const sageByDomain = new Map(sage.map((item) => [item.domain, item]));
  const comparisons = [];
  for (const sagejsDomain of sagejs) {
    const sageDomain = sageByDomain.get(sagejsDomain.domain);
    if (!sagejsDomain.ok || !sageDomain?.ok) continue;
    const sageCases = new Map(sageDomain.cases.map((item) => [item.operation, item]));
    for (const sagejsCase of sagejsDomain.cases) {
      const sageCase = sageCases.get(sagejsCase.operation);
      if (
        sageCase === undefined ||
        sagejsCase.status !== undefined ||
        sageCase.status !== undefined ||
        sagejsCase.comparable_input !== true ||
        sageCase.comparable_input !== true
      ) continue;
      comparisons.push({
        domain: sagejsDomain.domain,
        operation: sagejsCase.operation,
        sagejs_warm_ms: sagejsCase.warm_median_ms,
        sage_warm_ms: sageCase.warm_median_ms,
        sagejs_over_sage: sageCase.warm_median_ms === 0
          ? undefined
          : sagejsCase.warm_median_ms / sageCase.warm_median_ms,
      });
    }
  }
  return comparisons;
}

function findingsFor(runtimeReports, comparisons) {
  const findings = [];
  for (const [runtime, domainsForRuntime] of Object.entries(runtimeReports)) {
    for (const domain of domainsForRuntime) {
      if (!domain.ok) {
        findings.push({
          priority: "P0",
          kind: "capability-or-correctness-hole",
          runtime,
          domain: domain.domain,
          detail: domain.error,
        });
        continue;
      }
      for (const item of domain.cases) {
        if (item.status !== undefined) {
          findings.push({
            priority: item.status === "unsupported" ? "P1" : "P0",
            kind: item.status === "unsupported"
              ? "public-capability-hole"
              : "operation-or-witness-failure",
            runtime,
            domain: domain.domain,
            operation: item.operation,
            detail: `${item.exception}: ${item.detail}`,
          });
          continue;
        }
        const firstMeasuredRatio = item.warm_median_ms === 0
          ? undefined
          : item.first_measured_ms / item.warm_median_ms;
        if (firstMeasuredRatio >= 10 && item.first_measured_ms >= 50) {
          findings.push({
            priority: "P2",
            kind: "first-measured-invocation-dominates",
            runtime,
            domain: domain.domain,
            operation: item.operation,
            ratio: firstMeasuredRatio,
            detail: "The order-dependent first measured invocation is at least 10x the warm median and at least 50 ms; it is not a process-isolated cold measurement.",
          });
        }
      }
      if (runtime === "sagejs") {
        const untraced = domain.cases
          .filter(
            (item) =>
              item.status === undefined &&
              item.operation !== "construct_range" &&
              item.backends.length === 0,
          )
          .map((item) => item.operation);
        if (untraced.length >= 5) {
          findings.push({
            priority: "P2",
            kind: "backend-classification-gap",
            runtime,
            domain: domain.domain,
            operations: untraced,
            detail: "SAGEJS_NATIVE_TRACE emitted no route for these successful public operations.",
          });
        }
      }
    }
  }
  for (const comparison of comparisons) {
    if (comparison.sagejs_over_sage >= 10 && comparison.sagejs_warm_ms >= 5) {
      findings.push({
        priority: "P1",
        kind: "warm-performance-regression",
        ...comparison,
      });
    } else if (comparison.sagejs_over_sage >= 3 && comparison.sagejs_warm_ms >= 2) {
      findings.push({
        priority: "P2",
        kind: "warm-performance-regression",
        ...comparison,
      });
    }
  }
  findings.sort((left, right) => left.priority.localeCompare(right.priority));
  return findings;
}

function validate(report) {
  assert.equal(
    report.unavailable.length,
    0,
    `explicitly requested runtime unavailable: ${report.unavailable.map((item) => item.runtime).join(", ")}`,
  );
  const sagejs = report.runtimes.sagejs;
  assert.ok(sagejs, "check mode requires the Sage.js runtime");
  assert.equal(sagejs.length, domains.length);
  for (const domain of sagejs) {
    assert.equal(domain.ok, true, `${domain.domain}: ${domain.error}`);
    assert.deepEqual(domain.cases.map((item) => item.operation), expectedOperations);
    for (const item of domain.cases) {
      if (item.status !== undefined) {
        assert.equal(item.status, "unsupported", `${domain.domain}.${item.operation}: ${item.detail}`);
        continue;
      }
      assert.equal(item.witness, "verified");
      assert.ok(
        Number.isFinite(item.first_measured_ms) && item.first_measured_ms >= 0,
      );
      assert.ok(Number.isFinite(item.warm_median_ms) && item.warm_median_ms >= 0);
    }
  }
  assert.equal(
    report.findings.some((item) => item.priority === "P0"),
    false,
    "audit found an operation or correctness failure",
  );
}

function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function hostDescription() {
  const result = spawnSync("uname", ["-a"], { encoding: "utf8" });
  return {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    uname: result.status === 0 ? result.stdout.trim() : undefined,
    openblas_threads: 1,
    omp_threads: 1,
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const requestedRuntimes = options.runtime === "all"
    ? ["sagejs", "sage"]
    : [options.runtime];
  const sageCommand = requestedRuntimes.includes("sage") ? findSage() : undefined;
  const runtimeReports = {};
  const unavailable = [];
  for (const runtime of requestedRuntimes) {
    if (runtime === "sage" && sageCommand === undefined) {
      unavailable.push({ runtime: "sage", reason: "no SageMath executable found" });
      continue;
    }
    runtimeReports[runtime] = domains.map((domain) =>
      runDomain(runtime, domain, options.mode, sageCommand)
    );
  }
  const comparisons = compareRuntimes(runtimeReports);
  const report = {
    schema: "sagejs.benchmark/dense-matrix-public-audit-v1",
    revision: gitRevision(),
    host: hostDescription(),
    policy: {
      mode: options.mode,
      runtimes: requestedRuntimes,
      sage_command: sageCommand,
      timing_definition: [
        "fresh_process_ms is wall time for a new process and the complete domain workload",
        "runtime_bootstrap_estimate_ms is fresh process wall time minus in-script time",
        "first_measured_ms is the first measured invocation after operand setup at that point in the serial domain workload; earlier operations may have loaded the same backend, so this is not a cold measurement",
        "warm_median_ms is the median of immediately repeated, verified invocations",
      ],
      single_thread_environment: true,
      result_policy: "Every timed result is consumed by an operation-specific semantic witness.",
      source_policy: "Each operation reuses one fixed source. Cacheable and destructive algorithms time an explicit matrix copy plus the operation so result caches cannot make warm samples vacuous.",
      comparison_policy: "Sage ratios contain only identical deterministic inputs. Runtime-local random_matrix workloads are reported separately and excluded from comparisons.",
      full_mode: "Opt-in larger cases; compares with SageMath when an executable is available.",
    },
    domains: {
      ZZ: "dense exact integer matrices",
      QQ: "dense exact rational matrices",
      GF2: "dense matrices over GF(2)",
      GF7: "dense matrices over a small word prime",
      GFWORD: "dense matrices over GF(2^61-1)",
    },
    unavailable,
    runtimes: runtimeReports,
    comparisons,
    findings: findingsFor(runtimeReports, comparisons),
  };
  process.stdout.write(`${JSON.stringify(report, null, options.compact ? 0 : 2)}\n`);
  if (options.check) validate(report);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { parseOutput };
