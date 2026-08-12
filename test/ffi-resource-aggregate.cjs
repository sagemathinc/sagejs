#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve } = require("node:path");
const test = require("node:test");

const declarations = require("../tools/ffi/declarations.cjs");
const hostAdapters = require("../tools/ffi/host-adapters.cjs");

const root = resolve(__dirname, "..");

function valueParameter(name, type = "uint64") {
  return {
    name,
    type,
    ownership: "value",
    mutability: "value",
    aliasing: "not_applicable",
  };
}

function resourceParameter(name = "source") {
  return {
    name,
    type: "FmpzMatrix",
    ownership: "borrowed",
    mutability: "read",
    aliasing: "allowed",
  };
}

function indicesParameter() {
  return {
    name: "indices",
    type: "UInt64Buffer",
    ownership: "borrowed",
    mutability: "read",
    aliasing: "allowed",
  };
}

function readSlice() {
  return {
    source: "selected_rows",
    abi_type: "uint64_t_ptr",
    direction: "in",
    adapter: {
      kind: "packed_slice",
      data: "indices",
      length: "length",
      access: "read",
      aliasing: "allowed",
      transactional: false,
    },
  };
}

function functionPolicy(overrides) {
  return {
    effects: {
      pure: true,
      deterministic: true,
      thread_safe: true,
      may_allocate: false,
      may_raise: [],
      writes: [],
    },
    result: {
      domain: "direct",
      success: [],
      absence: null,
    },
    errors: { exception: null, message: null },
    exceptions: { policy: "none", failure_status: null },
    targets: { dynamic: true, native: true, wasm: false },
    ...overrides,
  };
}

function witnessDocument(headerDirectory) {
  const flint = JSON.parse(
    readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
  );
  const resource = structuredClone(
    flint.resources.find((item) => item.id === "fmpz_matrix"),
  );
  resource.dynamic.close_export = "ffiWitnessMatrixClose";
  const constructor = structuredClone(
    flint.functions.find((item) => item.id === "fmpz_matrix"),
  );
  constructor.id = "matrix_create";
  constructor.python_name = "matrix_create";
  constructor.dynamic.export = "ffiWitnessMatrixCreate";
  constructor.native.symbol = "sagejs_witness_matrix_create";

  const checksum = functionPolicy({
    id: "matrix_index_checksum",
    python_name: "matrix_index_checksum",
    signature: {
      parameters: [
        resourceParameter(),
        indicesParameter(),
        valueParameter("length"),
      ],
      return_type: "uint64",
      return_ownership: "value",
      borrow_from: null,
    },
    dynamic: { export: "ffiWitnessMatrixIndexChecksum" },
    native: {
      symbol: "sagejs_witness_matrix_index_checksum",
      return_type: "uint64_t",
      arguments: [
        {
          source: "source",
          abi_type: "sagejs_fmpz_matrix_t",
          direction: "in",
          adapter: null,
        },
        readSlice(),
        {
          source: "length",
          abi_type: "uint64_t",
          direction: "in",
          adapter: null,
        },
      ],
    },
  });

  const select = functionPolicy({
    id: "matrix_select_rows",
    python_name: "matrix_select_rows",
    signature: {
      parameters: [
        resourceParameter(),
        indicesParameter(),
        valueParameter("length"),
      ],
      return_type: "FmpzMatrix",
      return_ownership: "owned",
      borrow_from: null,
    },
    dynamic: { export: "ffiWitnessMatrixSelectRows" },
    native: {
      symbol: "sagejs_witness_matrix_select_rows",
      return_type: "int",
      arguments: [
        {
          source: "result",
          abi_type: "sagejs_fmpz_matrix_t",
          direction: "out",
          adapter: null,
        },
        {
          source: "source",
          abi_type: "sagejs_fmpz_matrix_t",
          direction: "in",
          adapter: null,
        },
        readSlice(),
        {
          source: "length",
          abi_type: "uint64_t",
          direction: "in",
          adapter: null,
        },
      ],
    },
    effects: {
      pure: false,
      deterministic: true,
      thread_safe: true,
      may_allocate: true,
      may_raise: ["ValueError"],
      writes: [],
    },
    result: { domain: "status", success: [1], absence: null },
    errors: {
      exception: "ValueError",
      message: "integer matrix row selection failed",
    },
  });

  return {
    schema_version: 6,
    library: {
      id: "witness",
      python_module: "sagejs.ffi.witness",
      dynamic: { package: "sagejs-ffi-resource-aggregate-witness" },
      native: {
        headers: [
          "sagejs/fmpz_matrix_ffi.h",
          "ffi_resource_aggregate_witness.h",
        ],
        link: structuredClone(flint.library.native.link),
        dependencies: structuredClone(flint.library.native.dependencies),
        toolchain: {
          ...structuredClone(flint.library.native.toolchain),
          source_include_dirs: [
            "packages/flint/include",
            relative(root, headerDirectory),
          ],
        },
      },
    },
    resources: [resource],
    functions: [constructor, checksum, select],
  };
}

function registryFor(declaration) {
  const byPythonName = new Map(declaration.functions.map((fn) => [
    fn.python_name,
    Object.freeze({
      ...fn,
      library: declaration.library,
      declaration_hash: declaration.hash,
      declaration_identity: `${declaration.identity}:${fn.id}`,
    }),
  ]));
  const byResourceType = new Map(
    declaration.resources.map((resource) => [resource.python_name, resource]),
  );
  const entry = Object.freeze({ ...declaration, byPythonName, byResourceType });
  return Object.freeze({
    schema: declarations.schema,
    root,
    catalog: declaration.abiCatalog,
    libraries: Object.freeze([entry]),
    byId: new Map([[declaration.library.id, entry]]),
    byModule: new Map([[declaration.library.python_module, entry]]),
  });
}

function witnessHeader() {
  return `#ifndef SAGEJS_FFI_RESOURCE_AGGREGATE_WITNESS_H
#define SAGEJS_FFI_RESOURCE_AGGREGATE_WITNESS_H

#include <stdint.h>
#include <sagejs/fmpz_matrix_ffi.h>

static inline int sagejs_witness_matrix_create(
    sagejs_fmpz_matrix_t result, uint64_t rows, uint64_t columns)
{
    if (!sagejs_fmpz_matrix_init(result, rows, columns))
        return 0;
    for (uint64_t row = 0; row < rows; row++)
        for (uint64_t column = 0; column < columns; column++)
            fmpz_set_ui(fmpz_mat_entry(result->value, (slong) row,
                (slong) column), (ulong) (row * columns + column + 1));
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

static inline uint64_t sagejs_witness_matrix_index_checksum(
    const sagejs_fmpz_matrix_t source, const uint64_t *indices,
    uint64_t length)
{
    const uint64_t rows = sagejs_fmpz_matrix_nrows(source);
    const uint64_t columns = sagejs_fmpz_matrix_ncols(source);
    uint64_t checksum = 0;
    for (uint64_t position = 0; position < length; position++)
    {
        if (indices[position] >= rows)
            return UINT64_MAX;
        for (uint64_t column = 0; column < columns; column++)
            checksum += (uint64_t) fmpz_get_ui(fmpz_mat_entry(source->value,
                (slong) indices[position], (slong) column));
    }
    return checksum;
}

static inline int sagejs_witness_matrix_select_rows(
    sagejs_fmpz_matrix_t result, const sagejs_fmpz_matrix_t source,
    const uint64_t *indices, uint64_t length)
{
    const uint64_t rows = sagejs_fmpz_matrix_nrows(source);
    const uint64_t columns = sagejs_fmpz_matrix_ncols(source);
    if (!sagejs_fmpz_matrix_dimensions_fit(length, columns))
        return 0;
    for (uint64_t position = 0; position < length; position++)
        if (indices[position] >= rows)
            return 0;
    if (!sagejs_fmpz_matrix_init(result, length, columns))
        return 0;
    for (uint64_t position = 0; position < length; position++)
        for (uint64_t column = 0; column < columns; column++)
            fmpz_set(fmpz_mat_entry(result->value, (slong) position,
                (slong) column), fmpz_mat_entry(source->value,
                (slong) indices[position], (slong) column));
    sagejs_fmpz_matrix_finish_result(result);
    return 1;
}

#endif
`;
}

function dynamicBackend() {
  const close = (matrix) => {
    matrix.closed = true;
  };
  const validate = (matrix) => {
    if (matrix.closed) throw new Error("FFI resource is closed");
  };
  return {
    ffiWitnessMatrixCreate(rows, columns) {
      const rowCount = Number(rows);
      const columnCount = Number(columns);
      return {
        rows: rowCount,
        columns: columnCount,
        entries: Array.from(
          { length: rowCount * columnCount },
          (_, index) => BigInt(index + 1),
        ),
        closed: false,
      };
    },
    ffiWitnessMatrixClose: close,
    ffiWitnessMatrixIndexChecksum(matrix, indices, length) {
      validate(matrix);
      let checksum = 0n;
      for (let position = 0; position < Number(length); position += 1) {
        const row = Number(indices[position]);
        if (row >= matrix.rows) return 18446744073709551615n;
        for (let column = 0; column < matrix.columns; column += 1) {
          checksum += matrix.entries[row * matrix.columns + column];
        }
      }
      return checksum & 18446744073709551615n;
    },
    ffiWitnessMatrixSelectRows(matrix, indices, length) {
      validate(matrix);
      const selected = Array.from(
        { length: Number(length) },
        (_, position) => Number(indices[position]),
      );
      if (selected.some((row) => row >= matrix.rows)) return false;
      return {
        rows: selected.length,
        columns: matrix.columns,
        entries: selected.flatMap((row) => matrix.entries.slice(
          row * matrix.columns,
          (row + 1) * matrix.columns,
        )),
        closed: false,
      };
    },
  };
}

function publicResource(state, identity, backend) {
  const tag = globalThis.__sagejs_ffi_resource_tag__ ??=
    Symbol("sagejs.test.ffi.resource");
  const resourceState = state.identity === identity ? state : {
    identity,
    handle: state,
    backend,
    close: backend.ffiWitnessMatrixClose,
    closed: false,
    ownership: "owned",
    owner: null,
    root: null,
  };
  if (resourceState.root === null) resourceState.root = resourceState;
  const token = { [tag]: resourceState };
  return {
    state: resourceState,
    _ffi_borrow() {
      return token;
    },
  };
}

test("resource and read-only UInt64Buffer aggregates compose safely", async () => {
  mkdirSync(join(root, "build"), { recursive: true });
  const temporary = mkdtempSync(join(root, "build", "ffi-resource-aggregate-"));
  const previousRequire = globalThis.__sagejs_runtime_require__;
  try {
    writeFileSync(
      join(temporary, "ffi_resource_aggregate_witness.h"),
      witnessHeader(),
    );
    const document = witnessDocument(temporary);
    const declaration = declarations.loadDeclarationDocument(document, {
      filename: join(temporary, "witness.ffi.json"),
      catalog: declarations.loadRegistry({ root }).catalog,
    });

    const checksum = declaration.functions.find(
      (fn) => fn.id === "matrix_index_checksum",
    );
    assert.deepEqual(checksum.call_plan.constraints, [{
      kind: "buffer_length",
      buffer: "indices",
      dimensions: ["length"],
      parameter_names: ["source", "indices", "length"],
    }]);
    assert.equal(checksum.call_plan.arguments[0].lowering.kind, "resource");
    assert.equal(checksum.call_plan.arguments[1].lowering.adapter, "packed_slice");

    const hostSource = hostAdapters.generatedHostAdapterSource(declaration);
    assert.match(hostSource, /source: FmpzMatrix/);
    assert.match(hostSource, /indices: UInt64Buffer/);
    assert.match(hostSource, /def ffiWitnessMatrixSelectRows/);
    assert.doesNotMatch(hostSource, /uint64_t\s*\*/);
    const sourcePath = join(temporary, "ffi_host.py");
    writeFileSync(sourcePath, hostSource);

    const registry = registryFor(declaration);
    declarations.loadRegistry = () => registry;
    delete require.cache[require.resolve("../tools/native-kernel/ir.cjs")];
    delete require.cache[require.resolve("../tools/native-kernel/compiler.cjs")];
    const { lowerSource } = require("../tools/native-kernel/ir.cjs");
    const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
    const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

    const ir = await lowerSource(hostSource, sourcePath);
    const core = generateHostCore(ir);
    assert.equal(core.audit.hostCallbacks, 0);
    assert.match(core.source, /sagejs_witness_matrix_index_checksum/);
    assert.match(core.source, /sagejs_witness_matrix_select_rows/);
    assert.match(core.source, /packed slice length does not match/);
    assert.match(core.source, /\.data/);
    assert.match(
      core.source,
      /sagejs_witness_matrix_select_rows\([^;]+;[\s\S]{0,500}_initialized = 1;/,
    );
    assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);

    const backend = dynamicBackend();
    globalThis.__sagejs_runtime_require__ = (packageName) => {
      assert.equal(packageName, "sagejs-ffi-resource-aggregate-witness");
      return backend;
    };
    const compiled = await compileKernel({ sourcePath, cacheRoot: temporary });
    const module = require(compiled.modulePath);
    const addon = require(compiled.addonPath);
    const identity = `resource:${declaration.identity}:fmpz_matrix`;

    const nativeHandle = module.ffiWitnessMatrixCreate(4n, 3n);
    const nativeMatrix = publicResource(nativeHandle, identity, addon);
    const dynamicState = module.ffiWitnessMatrixCreate.javascript(4n, 3n);
    assert.equal(dynamicState.closed, false);
    const dynamicMatrix = publicResource(dynamicState, identity, backend);
    const backing = BigUint64Array.from([99n, 3n, 1n, 88n]);
    const indices = backing.subarray(1, 3);
    const before = Array.from(backing);

    assert.equal(
      module.ffiWitnessMatrixIndexChecksum(nativeMatrix, indices, 2n),
      48n,
    );
    assert.equal(
      module.ffiWitnessMatrixIndexChecksum.javascript(
        dynamicMatrix, indices, 2n,
      ),
      48n,
    );
    assert.deepEqual(Array.from(backing), before);

    const nativeSelectedHandle = module.ffiWitnessMatrixSelectRows(
      nativeMatrix, indices, 2n,
    );
    const nativeSelected = publicResource(
      nativeSelectedHandle, identity, addon,
    );
    const dynamicSelectedState = module.ffiWitnessMatrixSelectRows.javascript(
      dynamicMatrix, indices, 2n,
    );
    assert.equal(dynamicSelectedState.closed, false);
    const dynamicSelected = publicResource(
      dynamicSelectedState, identity, backend,
    );
    const selectedRows = BigUint64Array.from([0n, 1n]);
    assert.equal(
      module.ffiWitnessMatrixIndexChecksum(nativeSelected, selectedRows, 2n),
      48n,
    );
    assert.equal(
      module.ffiWitnessMatrixIndexChecksum.javascript(
        dynamicSelected, selectedRows, 2n,
      ),
      48n,
    );

    for (const call of [
      () => module.ffiWitnessMatrixIndexChecksum(nativeMatrix, indices, 1n),
      () => module.ffiWitnessMatrixIndexChecksum.javascript(
        dynamicMatrix, indices, 1n,
      ),
    ]) assert.throws(call, /packed (?:slice|buffer) length/);
    for (const call of [
      () => module.ffiWitnessMatrixIndexChecksum(
        nativeMatrix, { length: 1, 0: -1 }, 1n,
      ),
      () => module.ffiWitnessMatrixIndexChecksum.javascript(
        dynamicMatrix, { length: 1, 0: -1 }, 1n,
      ),
    ]) assert.throws(call, /UInt64Buffer|dynamic FFI argument/);
    const wrong = publicResource(nativeHandle, identity + "-wrong", addon);
    assert.throws(
      () => module.ffiWitnessMatrixIndexChecksum(wrong, indices, 2n),
      /wrong FFI resource type/,
    );
    assert.throws(
      () => module.ffiWitnessMatrixSelectRows(
        nativeMatrix, BigUint64Array.from([4n]), 1n,
      ),
      /selection failed/,
    );
    assert.throws(
      () => module.ffiWitnessMatrixSelectRows.javascript(
        dynamicMatrix, BigUint64Array.from([4n]), 1n,
      ),
      /selection failed/,
    );

    addon.ffiWitnessMatrixClose(nativeSelectedHandle);
    backend.ffiWitnessMatrixClose(dynamicSelectedState.handle);
    dynamicSelectedState.closed = true;
    addon.ffiWitnessMatrixClose(nativeHandle);
    assert.throws(
      () => module.ffiWitnessMatrixIndexChecksum(nativeMatrix, indices, 2n),
      /resource is closed/,
    );
    backend.ffiWitnessMatrixClose(dynamicState.handle);
    dynamicState.closed = true;
    assert.throws(
      () => module.ffiWitnessMatrixIndexChecksum.javascript(
        dynamicMatrix, indices, 2n,
      ),
      /resource is closed/,
    );
  } finally {
    if (previousRequire === undefined) {
      delete globalThis.__sagejs_runtime_require__;
    } else {
      globalThis.__sagejs_runtime_require__ = previousRequire;
    }
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("resource aggregate declarations reject unproved mutation shapes", () => {
  const temporary = mkdtempSync(join(root, "build", "ffi-resource-invalid-"));
  try {
    const catalog = declarations.loadRegistry({ root }).catalog;
    const invalid = (mutator, pattern) => {
      const document = witnessDocument(temporary);
      mutator(document.functions.find(
        (fn) => fn.id === "matrix_index_checksum",
      ));
      assert.throws(
        () => declarations.loadDeclarationDocument(document, {
          filename: join(temporary, "invalid.ffi.json"),
          catalog,
        }),
        pattern,
      );
    };
    invalid((fn) => {
      fn.signature.parameters[0].ownership = "borrowed_mut";
      fn.signature.parameters[0].mutability = "write";
      fn.effects.pure = false;
      fn.effects.writes = ["source"];
    }, /resource\/aggregate composition.*mutable/);
    invalid((fn) => {
      fn.signature.parameters[1].ownership = "borrowed_mut";
      fn.signature.parameters[1].mutability = "write";
      fn.native.arguments[1].direction = "out";
      fn.native.arguments[1].adapter.access = "write";
      fn.native.arguments[1].adapter.transactional = true;
      fn.effects.pure = false;
      fn.effects.writes = ["indices"];
    }, /resource\/aggregate composition.*unsupported aggregate/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("read-only packed ingress may construct or derive owned resources", () => {
  const temporary = mkdtempSync(join(root, "build", "ffi-resource-ingress-"));
  try {
    const catalog = declarations.loadRegistry({ root }).catalog;
    const constructorDocument = witnessDocument(temporary);
    const constructor = structuredClone(constructorDocument.functions.find(
      (fn) => fn.id === "matrix_select_rows",
    ));
    constructor.id = "matrix_from_entries";
    constructor.python_name = "matrix_from_entries";
    constructor.dynamic.export = "ffiWitnessMatrixFromEntries";
    constructor.native.symbol = "sagejs_witness_matrix_from_entries";
    constructor.signature.parameters = constructor.signature.parameters.slice(1);
    constructor.native.arguments = [
      constructor.native.arguments[0],
      ...constructor.native.arguments.slice(2),
    ];
    constructorDocument.functions.push(constructor);
    const checkedConstructor = declarations.loadDeclarationDocument(
      constructorDocument,
      { filename: join(temporary, "constructor.ffi.json"), catalog },
    ).functions.find((fn) => fn.id === "matrix_from_entries");
    assert.equal(
      checkedConstructor.call_plan.arguments[1].lowering.adapter,
      "packed_slice",
    );
    const badConstructorDocument = witnessDocument(temporary);
    const badConstructor = structuredClone(constructor);
    badConstructor.id = "matrix_from_two_entry_slices";
    badConstructor.python_name = "matrix_from_two_entry_slices";
    badConstructor.dynamic.export = "ffiWitnessMatrixFromTwoEntrySlices";
    badConstructor.native.symbol = "sagejs_witness_matrix_from_two_entry_slices";
    badConstructor.signature.parameters.splice(
      1,
      0,
      structuredClone(badConstructor.signature.parameters[0]),
    );
    badConstructor.signature.parameters[1].name = "other_indices";
    badConstructor.native.arguments.splice(
      2,
      0,
      structuredClone(badConstructor.native.arguments[1]),
    );
    badConstructor.native.arguments[2].source = "other_selected_rows";
    badConstructor.native.arguments[2].adapter.data = "other_indices";
    badConstructorDocument.functions.push(badConstructor);
    assert.throws(
      () => declarations.loadDeclarationDocument(badConstructorDocument, {
        filename: join(temporary, "two-slices.ffi.json"),
        catalog,
      }),
      /resource\/aggregate composition.*only one read-only UInt64Buffer packed slice/,
    );

    const derivedDocument = witnessDocument(temporary);
    const flint = JSON.parse(
      readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
    );
    const byteRegion = structuredClone(
      flint.resources.find((item) => item.id === "byte_region"),
    );
    byteRegion.dynamic.close_export = "ffiWitnessByteRegionClose";
    derivedDocument.resources.push(byteRegion);
    const derived = structuredClone(derivedDocument.functions.find(
      (fn) => fn.id === "matrix_select_rows",
    ));
    derived.id = "matrix_selected_bytes";
    derived.python_name = "matrix_selected_bytes";
    derived.dynamic.export = "ffiWitnessMatrixSelectedBytes";
    derived.native.symbol = "sagejs_witness_matrix_selected_bytes";
    derived.signature.return_type = "FlintByteRegion";
    derived.native.arguments[0].abi_type = "sagejs_flint_byte_region_t";
    derivedDocument.functions.push(derived);
    const checkedDerived = declarations.loadDeclarationDocument(
      derivedDocument,
      { filename: join(temporary, "derived.ffi.json"), catalog },
    ).functions.find((fn) => fn.id === "matrix_selected_bytes");
    assert.equal(checkedDerived.signature.return_type, "FlintByteRegion");
    assert.equal(
      checkedDerived.call_plan.arguments[2].lowering.adapter,
      "packed_slice",
    );
    const badDerivedDocument = witnessDocument(temporary);
    badDerivedDocument.resources.push(byteRegion);
    const badDerived = structuredClone(derived);
    badDerived.id = "matrix_selected_bytes_mutable";
    badDerived.python_name = "matrix_selected_bytes_mutable";
    badDerived.dynamic.export = "ffiWitnessMatrixSelectedBytesMutable";
    badDerived.native.symbol = "sagejs_witness_matrix_selected_bytes_mutable";
    badDerived.signature.parameters[1].ownership = "borrowed_mut";
    badDerived.signature.parameters[1].mutability = "write";
    badDerived.native.arguments[2].direction = "out";
    badDerived.native.arguments[2].adapter.access = "write";
    badDerived.native.arguments[2].adapter.transactional = true;
    badDerived.effects.pure = false;
    badDerived.effects.writes = ["indices"];
    badDerivedDocument.functions.push(badDerived);
    assert.throws(
      () => declarations.loadDeclarationDocument(badDerivedDocument, {
        filename: join(temporary, "mutable-slice.ffi.json"),
        catalog,
      }),
      /resource\/aggregate composition.*unsupported aggregate/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
