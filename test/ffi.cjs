"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const declarations = require("../tools/ffi/declarations.cjs");
const boundaryAudit = require("../tools/ffi/boundary-audit.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = join(__dirname, "..");
const witness = join(root, "bench", "native-ffi-flint.py");
const matrixWitness = join(root, "bench", "native-ffi-flint-matrix.py");
const resourceWitness = join(root, "bench", "native-ffi-flint-resource.py");

function runSage(args, input = undefined) {
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  assert.equal(
    result.status,
    0,
    `sagejs ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function runSageDiagnostic(args, input) {
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  return `${result.stdout}\n${result.stderr}`;
}

test("FFI declarations are strict and generated modules are current", () => {
  const registry = declarations.loadRegistry({ root });
  assert.equal(registry.schema, "sagejs.ffi/declaration-v3");
  assert.equal(registry.libraries.length, 1);
  const flint = registry.byId.get("flint");
  assert.equal(flint.library.python_module, "sagejs.ffi.flint");
  assert.deepEqual(
    flint.functions.map((fn) => fn.id),
    [
      "dirichlet_group_init", "dirichlet_group_size",
      "dirichlet_group_num_primitive", "n_is_prime", "fmpz_gcd",
      "nmod_mat_rank", "nmod_mat_inv",
    ],
  );
  assert.deepEqual(
    flint.resources.map((resource) => resource.python_name),
    ["DirichletGroup"],
  );
  assert.match(flint.identity, /^flint@[0-9a-f]{64}$/);
  const generated = declarations.generatedModulePath(root, flint);
  assert.equal(
    readFileSync(generated, "utf8"),
    declarations.generatePythonModule(flint),
  );
  assert.match(
    readFileSync(generated, "utf8"),
    /_runtime\.ffi_call\(\n\s+__sagejs_ffi_declaration__ \+ ":n_is_prime"/,
  );
  assert.match(runSage(["ffi", "check"]), /7 function\(s\)/);
  const inspection = JSON.parse(
    runSage(["ffi", "explain", "flint", "--json"]),
  );
  assert.equal(inspection.identity, flint.identity);
  assert.equal(
    inspection.functions.find((fn) => fn.id === "fmpz_gcd").native.symbol,
    "fmpz_gcd",
  );
  assert.equal(inspection.resources[0].native.clear_symbol, "dirichlet_group_clear");
});

test("native-boundary audit is a reviewed exact ratchet", () => {
  const filename = boundaryAudit.snapshotPath(root);
  const snapshot = JSON.parse(readFileSync(filename, "utf8"));
  const current = boundaryAudit.validateBoundarySnapshot(snapshot, { root });
  assert.ok(current.counts["napi-export"] >= 280);
  assert.ok(current.counts["runtime-intrinsic"] >= 100);
  assert.equal(current.counts["declared-ffi"], 7);
  assert.equal(current.counts["declared-ffi-resource"], 1);
  assert.match(runSage(["ffi", "audit"]), /inventoried native boundaries/);
  const stale = structuredClone(snapshot);
  stale.boundaries.pop();
  assert.throws(
    () => boundaryAudit.validateBoundarySnapshot(stale, { root }),
    /native-boundary inventory has drifted/,
  );
});

test("FFI declarations fail closed on unknown fields", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-invalid-"));
  try {
    const directory = join(temporary, "ffi");
    mkdirSync(directory);
    const document = JSON.parse(
      readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
    );
    document.functions[0].unsafe_magic = true;
    writeFileSync(
      join(directory, "invalid.ffi.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    assert.throws(
      () => declarations.loadRegistry({ root: temporary }),
      /unknown field unsafe_magic/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("FFI declarations reject incompatible ownership and ABI mappings", () => {
  function invalid(mutator, pattern) {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-invalid-"));
    try {
      const directory = join(temporary, "ffi");
      mkdirSync(directory);
      const document = JSON.parse(
        readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
      );
      mutator(document);
      writeFileSync(
        join(directory, "invalid.ffi.json"),
        `${JSON.stringify(document, null, 2)}\n`,
      );
      assert.throws(() => declarations.loadRegistry({ root: temporary }), pattern);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  invalid(
    (document) => {
      document.functions[4].signature.parameters[0].ownership = "owned";
    },
    /Integer inputs must use borrowed ownership/,
  );
  invalid(
    (document) => {
      document.functions[3].native.arguments[0].abi_type = "fmpz_t";
    },
    /uint64 requires ulong, not fmpz_t/,
  );
  invalid(
    (document) => {
      document.functions[4].native.arguments.pop();
    },
    /omits native source right/,
  );
  invalid(
    (document) => {
      document.functions[5].native.arguments[0].adapter.data = "rows";
    },
    /adapter data must be UInt64Buffer/,
  );
  invalid(
    (document) => {
      document.functions[6].effects.pure = true;
    },
    /effects.pure functions may not declare writes/,
  );
  invalid(
    (document) => {
      document.functions[6].errors.exception = "KeyError";
    },
    /uses unsupported error exception KeyError/,
  );
  invalid(
    (document) => {
      document.resources[0].native.clear_symbol = "not a C symbol";
    },
    /clear_symbol must be a C identifier/,
  );
});

test("safe generated FLINT surface works in ordinary Sage.js", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.flint import n_is_prime, fmpz_gcd",
    "print(n_is_prime(97))",
    "print(n_is_prime(221))",
    "print(fmpz_gcd((2**127 - 1) * 17, (2**61 - 1) * 17))",
    "",
  ].join("\n"));
  assert.equal(output.trim(), "True\nFalse\n17");
  assert.match(
    runSageDiagnostic(["--python"],
      "from sagejs.ffi.flint import n_is_prime\nn_is_prime(-1)\n"),
    /invalid dynamic FFI argument for uint64/,
  );
  assert.match(
    runSageDiagnostic(["--python"],
      "from sagejs.ffi.flint import fmpz_gcd\nfmpz_gcd(1.5, 2)\n"),
    /invalid dynamic FFI argument for Integer/,
  );
});

test("packed FLINT matrix declarations work in ordinary Sage.js", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.flint import nmod_mat_rank, nmod_mat_inv",
    "print(nmod_mat_rank([1, 2, 3, 4], 2, 2, 5))",
    "out = [0, 0, 0, 0]",
    "print(nmod_mat_inv(out, [1, 2, 3, 4], 2, 5), out)",
    "try:",
    "    nmod_mat_inv([0, 0, 0, 0], [1, 2, 2, 4], 2, 5)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "2\nTrue [3, 1, 4, 2]\nValueError matrix is singular",
  );
});

test("generated opaque FLINT resources close deterministically", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.flint import dirichlet_group, dirichlet_group_size, dirichlet_group_num_primitive",
    "group = dirichlet_group(5)",
    "print(dirichlet_group_size(group), dirichlet_group_num_primitive(group), group.closed)",
    "group.close()",
    "group.close()",
    "print(group.closed)",
    "try:",
    "    dirichlet_group_size(group)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "with dirichlet_group(7) as scoped:",
    "    print(dirichlet_group_size(scoped))",
    "print(scoped.closed)",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "4 3 False\nTrue\nValueError FFI resource is closed\n6\nTrue",
  );
});

test("typed FFI imports lower to declared host-isolated calls", async () => {
  const source = readFileSync(witness, "utf8");
  const ir = await lowerSource(source, witness);
  assert.equal(ir.version, 19);
  assert.equal(ir.foreignLibraries.length, 1);
  assert.equal(ir.foreignLibraries[0].id, "flint");
  assert.match(ir.foreignLibraries[0].declarationHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(ir.callGraph, {
    flint_word_is_prime: [],
    flint_integer_gcd: [],
  });
  const calls = ir.functions.map((fn) => fn.body[0]);
  assert.deepEqual(calls.map((call) => call.kind), ["ffi.call", "ffi.call"]);
  assert.deepEqual(
    calls.map((call) => call.foreign.declarationId),
    ["flint:n_is_prime", "flint:fmpz_gcd"],
  );
  assert.deepEqual(
    ir.functions.map((fn) => fn.analysis.effects.calls[0].split(":").at(-1)),
    ["n_is_prime", "fmpz_gcd"],
  );
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.ok(core.audit.nativeDependencies.includes("flint"));
  assert.match(core.source, /#include <flint\/fmpz\.h>/);
  assert.match(core.source, /n_is_prime\(\(ulong\)/);
  assert.match(core.source, /fmpz_gcd\(/);
  assert.match(core.source, /fmpz_set_mpz\(/);
  assert.match(core.source, /fmpz_get_mpz\(/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("owned FLINT resources lower to lexical init and all-exit cleanup", async () => {
  const source = readFileSync(resourceWitness, "utf8");
  const ir = await lowerSource(source, resourceWitness);
  const fn = ir.functions[0];
  assert.equal(fn.foreignResources[0].python_name, "DirichletGroup");
  assert.match(fn.resourceAliases.group, /^sagejs_native_tmp_/);
  assert.equal(fn.analysis.effects.pure, false);
  assert.equal(fn.analysis.effects.replaySafe, false);
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /dirichlet_group_init\(/);
  assert.match(core.source, /dirichlet_group_size\(/);
  assert.match(core.source, /dirichlet_group_num_primitive\(/);
  assert.match(core.source, /if \([^\n]*_initialized\)/);
  assert.match(core.source, /dirichlet_group_clear\(/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("compiled owned resources agree with fallback and reject loop allocation", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-resource-"));
  try {
    const result = await compileKernel({
      sourcePath: resourceWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    assert.deepEqual(module.dirichlet_summary(5n), [4n, 3n]);
    assert.deepEqual(module.dirichlet_summary.javascript(5n), [4n, 3n]);
    assert.throws(() => module.dirichlet_summary(0n));
    assert.throws(() => module.dirichlet_summary.javascript(0n));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.flint import dirichlet_group\n" +
      "def f(modulus: uint64, count: uint64) -> bool:\n" +
      "    for index in range(count):\n" +
      "        group = dirichlet_group(modulus)\n" +
      "    return True\n",
      "resource-in-loop.py",
    ),
    /owned FFI resources must be created in the top-level native block/,
  );
});

test("packed matrix FFI lowers to lexical FLINT storage with checked status", async () => {
  const source = readFileSync(matrixWitness, "utf8");
  const ir = await lowerSource(source, matrixWitness);
  assert.deepEqual(
    ir.functions.map((fn) => fn.analysis.effects.externalWrites),
    [[], ["output"]],
  );
  assert.equal(ir.functions[0].analysis.effects.replaySafe, true);
  assert.equal(ir.functions[1].analysis.effects.replaySafe, false);
  const core = generateHostCore(ir);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.header, /sagejs_uint64_buffer/);
  assert.match(core.source, /nmod_mat_init\(/);
  assert.match(core.source, /nmod_mat_rank\(/);
  assert.match(core.source, /nmod_mat_inv\(/);
  assert.match(core.source, /nmod_mat_clear\(/);
  assert.match(core.source, /matrix is singular/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("compiled packed matrix FFI agrees with fallback and supports aliasing", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-matrix-"));
  try {
    const result = await compileKernel({
      sourcePath: matrixWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    const source = module.createUInt64Buffer([1n, 2n, 3n, 4n]);
    assert.equal(module.flint_nmod_rank(source, 2n, 2n, 5n), 2n);
    assert.equal(
      module.flint_nmod_rank.javascript(source, 2n, 2n, 5n),
      2n,
    );
    const output = module.createUInt64Buffer(4);
    assert.equal(module.flint_nmod_inverse(output, source, 2n, 5n), true);
    assert.deepEqual(Array.from(output), [3n, 1n, 4n, 2n]);
    const alias = module.createUInt64Buffer([1n, 2n, 3n, 4n]);
    assert.equal(module.flint_nmod_inverse(alias, alias, 2n, 5n), true);
    assert.deepEqual(Array.from(alias), [3n, 1n, 4n, 2n]);
    const dynamicOutput = [0n, 0n, 0n, 0n];
    assert.equal(module.flint_nmod_inverse.javascript(
      dynamicOutput, [1n, 2n, 3n, 4n], 2n, 5n,
    ), true);
    assert.deepEqual(dynamicOutput, [3n, 1n, 4n, 2n]);
    const singular = module.createUInt64Buffer([1n, 2n, 2n, 4n]);
    const failedOutput = module.createUInt64Buffer([9n, 9n, 9n, 9n]);
    assert.throws(
      () => module.flint_nmod_inverse(
        failedOutput, singular, 2n, 5n,
      ),
      /matrix is singular/,
    );
    assert.deepEqual(Array.from(failedOutput), [9n, 9n, 9n, 9n]);
    assert.deepEqual(module.flint_nmod_inverse.effects.externalWrites, ["output"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("declared FLINT functions execute identically through native and fallback paths", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-native-"));
  try {
    const result = await compileKernel({ sourcePath: witness, cacheRoot: temporary });
    const module = require(result.modulePath);
    for (const value of [2, 97, 221, 18446744073709551557n]) {
      assert.equal(
        module.flint_word_is_prime(value),
        module.flint_word_is_prime.javascript(value),
      );
    }
    const left = ((2n ** 127n) - 1n) * 17n;
    const right = ((2n ** 61n) - 1n) * 17n;
    assert.equal(module.flint_integer_gcd(left, right), 17n);
    assert.equal(module.flint_integer_gcd.gmp(left, right), 17n);
    assert.equal(module.flint_integer_gcd.javascript(left, right), 17n);
    assert.equal(module.flint_integer_gcd.backendFor(left, right), "tagged");
    assert.equal(module.flint_integer_gcd.effects.pure, true);
    assert.equal(module.flint_integer_gcd.effects.replaySafe, true);
    assert.equal(module.flint_integer_gcd.effects.threadSafe, true);
    assert.equal(module.flint_integer_gcd.effects.mayAllocate, true);
    assert.equal(module.flint_word_is_prime.effects.mayAllocate, false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("native FFI compilation rejects undeclared imports and functions", async () => {
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.missing import mystery\n" +
        "def f(value: uint64) -> bool:\n    return mystery(value)\n",
      "missing-ffi.py",
    ),
    /undeclared FFI module sagejs\.ffi\.missing/,
  );
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.flint import mystery\n" +
        "def f(value: uint64) -> bool:\n    return mystery(value)\n",
      "missing-function.py",
    ),
    /has no declared FFI function mystery/,
  );
});

test("native FFI imports preserve Python aliases and shadowing", async () => {
  const ir = await lowerSource(
    "from sagejs.ffi.flint import n_is_prime as abs\n" +
      "def f(value: uint64) -> bool:\n    return abs(value)\n",
    "aliased-ffi.py",
  );
  assert.equal(ir.functions[0].body[0].kind, "ffi.call");
  assert.equal(ir.functions[0].body[0].foreign.import.localName, "abs");
  assert.equal(ir.functions[0].body[0].foreign.function.pythonName, "n_is_prime");
});
