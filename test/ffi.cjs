"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const {
  generateExceptionShims,
} = require("../tools/native-kernel/ffi-codegen.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = join(__dirname, "..");
const witness = join(root, "bench", "native-ffi-flint.py");
const matrixWitness = join(root, "bench", "native-ffi-flint-matrix.py");
const resourceWitness = join(root, "bench", "native-ffi-flint-resource.py");
const igraphWitness = join(root, "bench", "native-ffi-igraph.py");
const igraphCanonicalWitness = join(
  root, "bench", "native-ffi-igraph-canonical.py",
);
const polynomialWitness = join(
  root, "bench", "native-ffi-flint-polynomial.py",
);

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
  assert.equal(registry.schema, "sagejs.ffi/declaration-v6");
  assert.equal(registry.catalog.schema, "sagejs.ffi/abi-catalog-v2");
  assert.equal(registry.libraries.length, 2);
  const flint = registry.byId.get("flint");
  assert.equal(flint.library.python_module, "sagejs.ffi.flint");
  assert.deepEqual(
    flint.functions.map((fn) => fn.id),
    [
      "dirichlet_group_init", "dirichlet_group_size",
      "dirichlet_group_num_primitive", "n_is_prime", "fmpz_gcd",
      "nmod_mat_rank", "nmod_mat_inv", "nmod_poly_mul",
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
  assert.deepEqual(
    declarations.generatedModulePaths(root, flint).map((filename) =>
      readFileSync(filename, "utf8")),
    [declarations.generatePythonModule(flint), declarations.generatePythonModule(flint)],
  );
  assert.match(
    readFileSync(generated, "utf8"),
    /_runtime\.ffi_call\(\n\s+__sagejs_ffi_declaration__ \+ ":n_is_prime"/,
  );
  const igraph = registry.byId.get("igraph");
  assert.deepEqual(igraph.ownershipGraph, [
    { resource: "graph", ownership: "owned", owner: null, root: "graph" },
    { resource: "edges", ownership: "borrowed", owner: "graph", root: "graph" },
  ]);
  assert.match(runSage(["ffi", "check"]), /15 function\(s\)/);
  const inspection = JSON.parse(
    runSage(["ffi", "explain", "flint", "--json"]),
  );
  assert.equal(inspection.identity, flint.identity);
  assert.equal(
    inspection.functions.find((fn) => fn.id === "fmpz_gcd").native.symbol,
    "fmpz_gcd",
  );
  const polynomialPlan = inspection.functions.find(
    (fn) => fn.id === "nmod_poly_mul",
  ).call_plan;
  assert.equal(polynomialPlan.schema, "sagejs.ffi/call-plan-v2");
  assert.equal(polynomialPlan.result.domain, "status");
  assert.deepEqual(polynomialPlan.result.success, [1]);
  assert.deepEqual(polynomialPlan.transactions, [
    { buffer: "output", commit: "success", staging: "temporary" },
  ]);
  assert.equal(polynomialPlan.arguments[0].lowering.adapter, "packed_slice");
  const canonical = registry.byId.get("igraph").functions.find(
    (fn) => fn.id === "canonical_permutation",
  );
  assert.equal(canonical.call_plan.arguments[2].lowering.kind, "record");
  assert.equal(canonical.exceptions.policy, "cxx_to_status");
  assert.match(canonical.call_plan.symbol,
    /^sagejs_ffi_shield_igraph_canonical_permutation$/);
  const nullable = registry.byId.get("igraph").functions.find(
    (fn) => fn.id === "first_edge_endpoint",
  );
  assert.equal(nullable.result.domain, "nullable");
  assert.equal(nullable.call_plan.native_return_c_type, "const uint64_t *");
  assert.equal(inspection.resources[0].native.clear_symbol, "dirichlet_group_clear");
});

test("native-boundary audit is a reviewed exact ratchet", () => {
  const filename = boundaryAudit.snapshotPath(root);
  const snapshot = JSON.parse(readFileSync(filename, "utf8"));
  const current = boundaryAudit.validateBoundarySnapshot(snapshot, { root });
  assert.ok(current.counts["napi-export"] >= 280);
  assert.ok(current.counts["runtime-intrinsic"] >= 100);
  assert.equal(current.counts["declared-ffi"], 15);
  assert.equal(current.counts["declared-ffi-resource"], 3);
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
    /uint64 requires ulong or uint64_t, not fmpz_t/,
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
  invalid(
    (document) => {
      document.functions[3].result.success = [1];
    },
    /direct result cannot declare failures/,
  );
  invalid(
    (document) => {
      document.functions[6].exceptions = {
        policy: "cxx_to_status", failure_status: 0,
      };
    },
    /C\+\+ shields require a distinct failure status and no wasm target/,
  );
});

test("FFI v6 records and nullable domains fail closed", () => {
  function invalid(mutator, pattern) {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-v6-invalid-"));
    try {
      const directory = join(temporary, "ffi");
      mkdirSync(directory);
      const document = JSON.parse(
        readFileSync(join(root, "ffi", "igraph.ffi.json"), "utf8"),
      );
      mutator(document);
      writeFileSync(join(directory, "invalid.ffi.json"),
        `${JSON.stringify(document, null, 2)}\n`);
      assert.throws(() => declarations.loadRegistry({ root: temporary }), pattern);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  invalid(
    (document) => {
      delete document.functions[5].native.arguments[2].adapter.fields.directed;
    },
    /record fields is missing directed/,
  );
  invalid(
    (document) => {
      document.functions[6].native.return_type = "uint64_t";
    },
    /nullable result needs a pointer ABI/,
  );
});

test("FFI ownership graphs reject cycles", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-cycle-"));
  try {
    const directory = join(temporary, "ffi");
    mkdirSync(directory);
    const document = JSON.parse(
      readFileSync(join(root, "ffi", "igraph.ffi.json"), "utf8"),
    );
    document.resources[1].owner = "edges";
    writeFileSync(join(directory, "invalid.ffi.json"),
      `${JSON.stringify(document, null, 2)}\n`);
    assert.throws(
      () => declarations.loadRegistry({ root: temporary }),
      /ownership graph contains a cycle/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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

test("packed-slice declarations work through both ordinary dynamic adapters", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.igraph import canonical_permutation, first_edge_endpoint",
    "from sagejs.ffi.flint import nmod_poly_mul",
    "labels = [99] * 6",
    "edges = [0,1,1,2,2,3,3,4,4,5,5,0]",
    "print(canonical_permutation(labels, edges, 6, 12, False), labels)",
    "print(first_edge_endpoint(edges, 12))",
    "try:",
    "    first_edge_endpoint([], 0)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "product = [99] * 5",
    "print(nmod_poly_mul(product, [1,2,3], [4,5,6], 5, 3, 3, 101), product)",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "True [3, 4, 2, 5, 1, 0]\n0\n" +
      "ValueError graph has no edge endpoints\nTrue [4, 13, 28, 27, 18]",
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

test("generated igraph views pin owners and invalidate on explicit close", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.igraph import complete_graph, vertex_count, edges, edge_count, edge_checksum",
    "graph = complete_graph(5, False, False)",
    "view = edges(graph)",
    "print(vertex_count(graph), edge_count(view), edge_checksum(view), view.valid, graph.closed)",
    "graph.close()",
    "graph.close()",
    "print(view.valid, graph.closed)",
    "try:",
    "    edge_count(view)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "5 10 4663669198664987395 True False\nFalse True\n" +
      "ValueError FFI resource is closed",
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

test("borrowed igraph views lower without cleanup and agree across paths", async () => {
  const source = readFileSync(igraphWitness, "utf8");
  const ir = await lowerSource(source, igraphWitness);
  const fn = ir.functions[0];
  assert.deepEqual(
    fn.foreignResources.map((resource) => [resource.python_name, resource.ownership]),
    [["IGraph", "owned"], ["IGraphEdges", "borrowed"]],
  );
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /sagejs_igraph_edges_borrow\(/);
  assert.match(core.source, /sagejs_igraph_graph_clear\(/);
  assert.doesNotMatch(core.source, /napi_|PyObject|JSValue|v8::/);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-igraph-"));
  try {
    const result = await compileKernel({
      sourcePath: igraphWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    assert.deepEqual(
      module.complete_graph_summary(5n),
      [5n, 10n, 4663669198664987395n],
    );
    assert.deepEqual(
      module.complete_graph_summary.javascript(5n),
      [5n, 10n, 4663669198664987395n],
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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

test("generic packed slices compile igraph and FLINT without symbol intrinsics", async () => {
  const codeGenerator = readFileSync(
    join(root, "tools", "native-kernel", "ffi-codegen.cjs"), "utf8",
  );
  assert.doesNotMatch(codeGenerator,
    /sagejs_igraph_canonical_permutation_packed|sagejs_flint_nmod_poly_mul_packed/);
  for (const sourcePath of [igraphCanonicalWitness, polynomialWitness]) {
    const source = readFileSync(sourcePath, "utf8");
    const ir = await lowerSource(source, sourcePath);
    const operation = ir.functions[0].body.find((item) => item.kind === "ffi.call");
    assert.equal(operation.foreign.function.call_plan.schema,
      "sagejs.ffi/call-plan-v2");
    assert.equal(operation.foreign.function.call_plan.arguments[0]
      .lowering.adapter, "packed_slice");
    const core = generateHostCore(ir);
    assert.equal(core.audit.hostCallbacks, 0);
    assert.match(core.source, /unable to stage FFI output/);
    assert.match(core.source, /memcpy\(/);
    if (sourcePath === igraphCanonicalWitness) {
      assert.ok(core.audit.nativeDependencies.includes("C++ runtime"));
      assert.match(core.source, /sagejs_igraph_canonical_request_t/);
      assert.match(core.source,
        /sagejs_ffi_shield_igraph_canonical_permutation/);
      assert.match(core.source, /graph has no edge endpoints/);
    }
    assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
  }
});

test("generated C++ shields convert actual exceptions to declared status", (t) => {
  if (process.platform === "win32") {
    t.skip("portable compiler smoke test uses Unix C++ command-line syntax");
    return;
  }
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).status !== 0) {
    t.skip(`${compiler} is unavailable`);
    return;
  }
  const fn = {
    declaration_id: "witness:may_throw",
    result: { domain: "status", success: [1], absence: null },
    exceptions: { policy: "cxx_to_status", failure_status: -7 },
    call_plan: {
      symbol: "sagejs_ffi_shield_witness_may_throw",
      foreign_symbol: "witness_may_throw",
      native_return_c_type: "int",
      arguments: [{
        position: 0,
        lowering: { kind: "scalar", c_type: "uint64_t" },
      }],
    },
  };
  const ir = {
    foreignLibraries: [{ native: { headers: ["witness.hpp"] } }],
    functions: [{
      body: [{ kind: "ffi.call", foreign: { function: fn } }],
    }],
  };
  const generated = generateExceptionShims(ir);
  assert.ok(generated);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-shield-"));
  try {
    writeFileSync(join(temporary, "ffi_shims.h"), generated.header);
    writeFileSync(join(temporary, "ffi_shims.cc"), generated.source);
    writeFileSync(join(temporary, "witness.hpp"),
      "#include <stdint.h>\nextern \"C\" int witness_may_throw(uint64_t);\n");
    writeFileSync(join(temporary, "witness.cc"),
      "#include <stdexcept>\n#include \"witness.hpp\"\n" +
      "extern \"C\" int witness_may_throw(uint64_t value) {\n" +
      "  if (value == 7) throw std::runtime_error(\"witness\");\n" +
      "  return 1;\n}\n");
    writeFileSync(join(temporary, "main.cc"),
      "#include \"ffi_shims.h\"\n" +
      "int main() {\n" +
      "  if (sagejs_ffi_shield_witness_may_throw(2) != 1) return 1;\n" +
      "  if (sagejs_ffi_shield_witness_may_throw(7) != -7) return 2;\n" +
      "  return 0;\n}\n");
    const executable = join(temporary, "shield-test");
    const build = spawnSync(compiler, [
      "-std=c++17", `-I${temporary}`, join(temporary, "ffi_shims.cc"),
      join(temporary, "witness.cc"), join(temporary, "main.cc"),
      "-o", executable,
    ], { encoding: "utf8" });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const run = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("compiled packed slices agree with fallbacks and commit outputs transactionally", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-slices-"));
  try {
    const graphResult = await compileKernel({
      sourcePath: igraphCanonicalWitness,
      cacheRoot: join(temporary, "graph"),
    });
    const graph = require(graphResult.modulePath);
    assert.ok(existsSync(graphResult.shimSourcePath));
    assert.ok(existsSync(graphResult.shimHeaderPath));
    assert.match(readFileSync(graphResult.shimSourcePath, "utf8"),
      /catch \(\.\.\.\)/);
    assert.match(readFileSync(graphResult.shimSourcePath, "utf8"),
      /return 0;/);
    const edges = graph.createUInt64Buffer([
      0n, 1n, 1n, 2n, 2n, 3n, 3n, 4n, 4n, 5n, 5n, 0n,
    ]);
    const labels = graph.createUInt64Buffer(6);
    assert.equal(graph.igraph_canonical_labels(labels, edges, 6n, 12n, false), true);
    const dynamicLabels = [0n, 0n, 0n, 0n, 0n, 0n];
    assert.equal(graph.igraph_canonical_labels.javascript(
      dynamicLabels, Array.from(edges), 6n, 12n, false,
    ), true);
    assert.deepEqual(Array.from(labels), dynamicLabels);
    assert.equal(graph.igraph_first_endpoint(edges, 12n), 0n);
    assert.equal(graph.igraph_first_endpoint.javascript(
      Array.from(edges), 12n,
    ), 0n);
    const noEdges = graph.createUInt64Buffer(0);
    assert.throws(() => graph.igraph_first_endpoint(noEdges, 0n),
      /graph has no edge endpoints/);
    assert.throws(() => graph.igraph_first_endpoint.javascript([], 0n),
      /graph has no edge endpoints/);
    const failedLabels = graph.createUInt64Buffer([
      91n, 92n, 93n, 94n, 95n, 96n,
    ]);
    const oddEdges = graph.createUInt64Buffer([0n, 1n, 2n]);
    assert.throws(() => graph.igraph_canonical_labels(
      failedLabels, oddEdges, 6n, 3n, false,
    ), /canonical labeling failed/);
    assert.deepEqual(Array.from(failedLabels), [91n, 92n, 93n, 94n, 95n, 96n]);

    const polynomialResult = await compileKernel({
      sourcePath: polynomialWitness,
      cacheRoot: join(temporary, "flint"),
    });
    const polynomial = require(polynomialResult.modulePath);
    const left = polynomial.createUInt64Buffer([1n, 2n, 3n]);
    const right = polynomial.createUInt64Buffer([4n, 5n, 6n]);
    const product = polynomial.createUInt64Buffer(5);
    assert.equal(polynomial.flint_nmod_polynomial_product(
      product, left, right, 5n, 3n, 3n, 101n,
    ), true);
    assert.deepEqual(Array.from(product), [4n, 13n, 28n, 27n, 18n]);
    const failedProduct = polynomial.createUInt64Buffer([
      81n, 82n, 83n, 84n,
    ]);
    assert.throws(() => polynomial.flint_nmod_polynomial_product(
      failedProduct, left, right, 4n, 3n, 3n, 101n,
    ), /invalid packed polynomial multiplication/);
    assert.deepEqual(Array.from(failedProduct), [81n, 82n, 83n, 84n]);
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
