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
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = join(__dirname, "..");
const witness = join(root, "bench", "native-ffi-flint.py");

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
  assert.equal(registry.schema, "sagejs.ffi/declaration-v1");
  assert.equal(registry.libraries.length, 1);
  const flint = registry.byId.get("flint");
  assert.equal(flint.library.python_module, "sagejs.ffi.flint");
  assert.deepEqual(
    flint.functions.map((fn) => fn.id),
    ["n_is_prime", "fmpz_gcd"],
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
  assert.match(runSage(["ffi", "check"]), /2 function\(s\)/);
  const inspection = JSON.parse(
    runSage(["ffi", "explain", "flint", "--json"]),
  );
  assert.equal(inspection.identity, flint.identity);
  assert.equal(inspection.functions[1].native.symbol, "fmpz_gcd");
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
      document.functions[1].signature.parameters[0].ownership = "owned";
    },
    /Integer inputs must use borrowed ownership/,
  );
  invalid(
    (document) => {
      document.functions[0].native.arguments[0].abi_type = "fmpz_t";
    },
    /uint64 requires ulong, not fmpz_t/,
  );
  invalid(
    (document) => {
      document.functions[1].native.arguments.pop();
    },
    /omits native source right/,
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

test("typed FFI imports lower to declared host-isolated calls", async () => {
  const source = readFileSync(witness, "utf8");
  const ir = await lowerSource(source, witness);
  assert.equal(ir.version, 18);
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
