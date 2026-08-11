"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const sourceDeclarations = require("../tools/ffi/source-declarations.cjs");
const { generateArtifacts } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = join(__dirname, "..");

test("resource declarations lower an optional owned size callback", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-resource-size-"));
  try {
    const source = readFileSync(join(root, "ffi", "igraph.ffi.py"), "utf8")
      .replace(
        '    clear="sagejs_igraph_graph_clear",\n',
        '    clear="sagejs_igraph_graph_clear",\n' +
          '    size="sagejs_igraph_graph_allocated_bytes",\n',
      );
    const filename = join(temporary, "fixture.ffi.py");
    writeFileSync(filename, source);
    const lowered = await sourceDeclarations.parseDeclarationSource(filename, {
      root,
    });
    assert.equal(
      lowered.document.resources[0].native.size_symbol,
      "sagejs_igraph_graph_allocated_bytes",
    );
    assert.equal(lowered.document.resources[1].native.size_symbol, undefined);
    assert.match(
      lowered.text,
      /"size_symbol": "sagejs_igraph_graph_allocated_bytes"/,
    );

    const invalid = source.replace(
      '    owner="graph",\n',
      '    owner="graph",\n    size="sagejs_igraph_edges_allocated_bytes",\n',
    );
    writeFileSync(filename, invalid);
    await assert.rejects(
      sourceDeclarations.parseDeclarationSource(filename, { root }),
      /edges native size callback requires ownership/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("generated owned holders balance and refresh external memory", async () => {
  const filename = join(root, "packages", "flint", "generated", "ffi_host.py");
  const source = readFileSync(filename, "utf8") + `

@native
def ffiResourceAccountingHelper(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool:
    return _ffi_fmpq_matrix_set_entry(
        matrix, row, column, numerator, denominator,
    )


@native
def ffiResourceAccountingOuter(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool:
    return ffiResourceAccountingHelper(
        matrix, row, column, numerator, denominator,
    )
`;
  const ir = JSON.parse(JSON.stringify(
    await lowerSource(source, filename),
  ));

  function addFixtureSize(value) {
    if (Array.isArray(value)) {
      for (const item of value) addFixtureSize(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    if (value.id === "fmpq_matrix" && value.native?.clear_symbol !== undefined) {
      value.native.size_symbol = "sagejs_fmpq_matrix_allocated_bytes";
    }
    for (const item of Object.values(value)) addFixtureSize(item);
  }
  addFixtureSize(ir);
  const copyFixture = ir.functions.find(
    (fn) => fn.name === "ffiFmpqMatrixCopy",
  );
  copyFixture.analysis.effects.externalWrites = ["source"];
  const outerFixture = ir.functions.find(
    (fn) => fn.name === "ffiResourceAccountingOuter",
  );
  assert.deepEqual(outerFixture.analysis.effects.externalWrites, ["matrix"]);
  const adapter = generateArtifacts(ir).adapterSource;
  function wrapper(name) {
    const start = adapter.indexOf(`static napi_value ${name}(`);
    assert.notEqual(start, -1);
    const next = adapter.indexOf("\nstatic napi_value ", start + 1);
    return adapter.slice(start, next === -1 ? undefined : next);
  }
  assert.match(adapter, /int64_t accounted_bytes;/);
  assert.match(
    adapter,
    /__sagejsFfiResourceExternalMemory[\s\S]*?sagejs_resource_external_memory/,
  );
  assert.match(
    adapter,
    /napi_create_bigint_int64\(\s*env, holder->accounted_bytes, &result\)/,
  );
  assert.match(
    adapter,
    /sagejs_fmpq_matrix_allocated_bytes\(holder->value\)/,
  );
  assert.match(
    adapter,
    /napi_adjust_external_memory\(env, change, &adjusted\)/,
  );
  assert.match(
    adapter,
    /napi_adjust_external_memory\(env, -accounted, &adjusted\)/,
  );
  assert.match(
    adapter,
    /compiled_ffiFmpqMatrixSetEntry[\s\S]*?native_ffiFmpqMatrixSetEntry[\s\S]*?sagejs_resource_FmpqMatrix_refresh_external_memory\(env, sagejs_wrapper_matrix\)/,
  );
  assert.match(
    adapter,
    /if \(!native_ffiFmpqMatrixSetEntry[\s\S]*?\(void\) sagejs_resource_FmpqMatrix_refresh_external_memory\(env, sagejs_wrapper_matrix\);[\s\S]*?sagejs_native_throw_status/,
  );
  assert.match(
    adapter,
    /napi_wrap\(env, object, holder,[\s\S]*?\*holder_address = NULL;[\s\S]*?refresh_external_memory\(env, holder\)/,
  );
  assert.match(
    adapter,
    /sagejs_fmpq_matrix_clear\(holder->value\);[\s\S]*?holder->accounted_bytes = 0;[\s\S]*?napi_adjust_external_memory/,
  );
  for (const name of [
    "compiled_ffiFmpqMatrixCopy",
    "compiled_ffiFmpqMatrixCopy_gmp",
  ]) {
    const generated = wrapper(name);
    const initialized = generated.indexOf(
      "sagejs_wrapper_result->initialized = 1;",
    );
    const refreshed = generated.indexOf(
      "sagejs_resource_FmpqMatrix_refresh_external_memory(" +
        "env, sagejs_wrapper_source)",
      initialized,
    );
    const wrapped = generated.indexOf(
      "sagejs_resource_FmpqMatrix_wrap(env, &sagejs_wrapper_result)",
    );
    assert.ok(initialized !== -1 && initialized < refreshed);
    assert.ok(refreshed < wrapped);
    assert.match(
      generated,
      /fail:[\s\S]*?sagejs_resource_FmpqMatrix_finalize\(env, sagejs_wrapper_result, NULL\)/,
    );
  }
  for (const name of [
    "compiled_ffiResourceAccountingOuter",
    "compiled_ffiResourceAccountingOuter_gmp",
  ]) {
    const generated = wrapper(name);
    assert.match(
      generated,
      /\(void\) sagejs_resource_FmpqMatrix_refresh_external_memory\(env, sagejs_wrapper_matrix\);[\s\S]*?sagejs_native_throw_status/,
    );
    assert.match(
      generated,
      /sagejs_native_check_napi\(env, sagejs_resource_FmpqMatrix_refresh_external_memory\(env, sagejs_wrapper_matrix\)\)/,
    );
  }
  assert.doesNotMatch(
    generateArtifacts(ir).coreSource,
    /napi_adjust_external_memory|napi_env|node_api/,
  );
});
