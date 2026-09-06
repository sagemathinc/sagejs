// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const test = require("node:test");
const { parseDeclarationSource } = require("../tools/ffi/source-declarations.cjs");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore, generateC, NATIVE_ABI_VERSION } = require("../tools/native-kernel/c-backend.cjs");
const { generateJavaScript } = require("../tools/native-kernel/js-backend.cjs");
const { classifyWasmFunction } = require("../tools/native-kernel/wasm-bridge.cjs");
const { bindingGyp } = require("../tools/native-kernel/compiler.cjs");

test("floating foreign slices stage writes and preserve aliasing on failure", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-floating-ffi-"));
  try {
    fs.mkdirSync(path.join(temporary, "ffi"));
    const declarationPath = path.join(temporary, "ffi", "witness.ffi.py");
    fs.writeFileSync(declarationPath, `from sagejs.ffi.declare import Library, Effects, Status, Writable, in_, out, packed_float64_slice
witness = Library(
    id="witness", python_module="sagejs.ffi.witness",
    package="@sagemath/sagejs-witness", headers=["witness.h"],
    link_unix=[], link_linux=[], link_darwin=[], link_windows=[],
    dependencies=[], prefix_environment="SAGEJS_WITNESS_PREFIX",
    unix_default="packages/witness/prefix", windows_default="packages/witness/prefix",
    include_dirs=["include"], source_include_dirs=[])
@witness.function(
    dynamic="copyChecked", symbol="copy_checked", returns=int,
    abi=[out("destination", double_ptr, packed_float64_slice(data="output", length="count", access="write", aliasing="allowed", transactional=True)),
         in_("source", double_ptr, packed_float64_slice(data="values", length="count", access="read", aliasing="allowed", transactional=False)),
         in_("count", uint64_t), in_("reject", uint64_t)],
    effects=Effects(pure=False, allocates=False, raises=[RuntimeError], writes=["output"]),
    result=Status(1, exception=RuntimeError, message="rejected witness"), wasm=False)
def copy_checked(output: Writable[Float64Buffer], values: Float64Buffer, count: uint64, reject: uint64) -> bool: ...
`);
    const parsed = await parseDeclarationSource(declarationPath);
    const rejectedPath = path.join(temporary, "rejected.ffi.py");
    fs.writeFileSync(rejectedPath, parsed.source.replace("wasm=False", "wasm=True"));
    await assert.rejects(parseDeclarationSource(rejectedPath), /not yet supported by generated Wasm adapters/);
    fs.writeFileSync(rejectedPath, parsed.source.replace("values: Float64Buffer", "values: UInt64Buffer"));
    await assert.rejects(parseDeclarationSource(rejectedPath), /Float64Buffer/);
    fs.writeFileSync(path.join(temporary, "ffi", "witness.ffi.json"), parsed.text);
    const ffiRegistry = loadRegistry({ root: temporary });
    const kernelSource = `from sagejs.native import native, Float64Buffer, uint64
from sagejs.ffi.witness import copy_checked
@native
def checked(output: Float64Buffer, values: Float64Buffer, count: uint64, reject: uint64) -> bool:
    return copy_checked(output, values, count, reject)
@native
def indirect(output: Float64Buffer, values: Float64Buffer, count: uint64, reject: uint64) -> bool:
    return checked(output, values, count, reject)
`;
    const sourcePath = path.join(temporary, "floating_witness.py");
    fs.writeFileSync(sourcePath, kernelSource);
    const ir = await lowerSource(kernelSource, sourcePath, { ffiRegistry });
    assert.deepEqual(ir.functions[0].analysis.effects.mutates, ["output"]);
    assert.equal(ir.functions[0].analysis.effects.pure, false);
    assert.ok(ir.functions[0].analysis.effects.mayRaise.includes("RuntimeError"));
    assert.deepEqual(classifyWasmFunction(ir.functions[0], ir), {
      supported: false, reason: "foreign-function-not-declared-for-wasm",
    });
    assert.deepEqual(ir.functions[1].analysis.effects.mutates, ["output"]);
    assert.equal(ir.functions[1].analysis.effects.pure, false);
    assert.deepEqual(classifyWasmFunction(ir.functions[1], ir), {
      supported: false, reason: "foreign-function-not-declared-for-wasm",
    });
    const core = generateHostCore(ir);
    assert.equal(core.audit.hostCallbacks, 0);
    assert.doesNotMatch(core.source, /\bmpz_init\b|\bfmpz_init\b/);
    for (const platform of ["linux", "darwin", "win32"]) {
      const binding = bindingGyp(ir, false, false, platform);
      assert.doesNotMatch(JSON.stringify(binding.targets[0].libraries), /(?:flint|mpfr|mpc|gmp)(?:\.|\b)/i);
    }
    const dynamicPath = path.join(temporary, "dynamic.cjs");
    const packageDirectory = path.join(temporary, "node_modules", "@sagemath", "sagejs-witness");
    const hash = value => createHash("sha256").update(value).digest("hex");
    fs.writeFileSync(dynamicPath, generateJavaScript(ir, {
      sourcePath, sourceHash: hash(kernelSource), cacheKey: hash(JSON.stringify(ir)),
      nativeAbi: NATIVE_ABI_VERSION,
      foreignDeclarations: [{ id: "witness", declarationIdentity: parsed.declaration.identity, dynamicPackage: packageDirectory }],
    }));
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(path.join(packageDirectory, "index.js"), `exports.__sagejs_ffi_manifest__ = {library: ${JSON.stringify(parsed.declaration.identity)}};
    exports.copyChecked = (out, source, count, reject) => {
      if (reject !== 0n) throw new Error("rejected witness");
      const stage = Array.from(source, x => 2*x);
      for (let i=0; i<Number(count); i++) out[i]=stage[i];
      return true;
    };`);
    const dynamicCheck = spawnSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const dynamic = require('./dynamic.cjs').checked.javascript;
      const values = new Float64Array([1, -2, 3]);
      assert.equal(dynamic(values, values, 3, 0), true);
      assert.deepEqual([...values], [2, -4, 6]);
      for (const invalid of ['1', true, null, {valueOf() {throw Error('user hook');}}]) {
        assert.throws(() => dynamic([0], [invalid], 1, 0), /binary64 float/);
      }
      assert.throws(() => dynamic(values, values, 2, 0), /length/);
      assert.deepEqual([...values], [2, -4, 6]);
      assert.throws(() => dynamic(values, values, 3, 1), /rejected witness/);
      assert.deepEqual([...values], [2, -4, 6]);
    `], { cwd: temporary, encoding: "utf8" });
    assert.equal(dynamicCheck.status, 0, dynamicCheck.stderr);
    fs.writeFileSync(path.join(temporary, "kernel_core.h"), core.header);
    fs.writeFileSync(path.join(temporary, "kernel_core.c"), core.source);
    fs.writeFileSync(path.join(temporary, "witness.h"), `#ifndef FLOATING_FFI_WITNESS_H
#define FLOATING_FFI_WITNESS_H
#include <stdint.h>
static int copy_checked(double *output, double *source, uint64_t count, uint64_t reject) {
    for (uint64_t i=0; i<count; ++i) output[i] = source[i] * 2;
    return reject ? 0 : 1;
}
#endif
`);
    fs.writeFileSync(path.join(temporary, "main.c"), `#include <assert.h>
#include <stdlib.h>
static int fail_allocation = 0;
static void *checked_calloc(size_t count, size_t size) {
    return fail_allocation ? NULL : calloc(count, size);
}
#define calloc checked_calloc
#include "kernel_core.c"
int main(void) {
    sagejs_native_status status = {0}; int result = 0;
    double data[] = {1, -2, 3}; sagejs_float64_buffer buffer = {data, 3};
    assert(sagejs_kernel_checked(&status, &result, buffer, buffer, 3, 0));
    assert(result == 1 && data[0] == 2 && data[1] == -4 && data[2] == 6);
    assert(!sagejs_kernel_checked(&status, &result, buffer, buffer, 3, 1));
    assert(data[0] == 2 && data[1] == -4 && data[2] == 6);
    assert(!sagejs_kernel_checked(&status, &result, buffer, buffer, 2, 0));
    assert(data[0] == 2 && data[1] == -4 && data[2] == 6);
    fail_allocation = 1;
    assert(!sagejs_kernel_checked(&status, &result, buffer, buffer, 3, 0));
    assert(data[0] == 2 && data[1] == -4 && data[2] == 6);
    sagejs_float64_buffer empty = {NULL, 0};
    assert(sagejs_kernel_checked(&status, &result, empty, empty, 0, 0));
    assert(sagejs_kernel_indirect(&status, &result, empty, empty, 0, 0));
    return 0;
}
`);
    const executable = path.join(temporary, process.platform === "win32" ? "witness.exe" : "witness");
    let compiled;
    if (process.platform === "win32") {
      const found = spawnSync("C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe", ["-latest", "-products", "*", "-property", "installationPath"], { encoding: "utf8", timeout: 10000 });
      assert.equal(found.status, 0, "native Visual Studio toolchain required");
      const vcvars = path.join(found.stdout.trim(), "VC/Auxiliary/Build/vcvars64.bat");
      for (const name of [vcvars, temporary]) assert.doesNotMatch(name, /["\r\n%]/);
      const batch = path.join(temporary, "compile.cmd");
      fs.writeFileSync(batch, `@echo off\r\ncall "${vcvars}"\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl /nologo /std:c11 /W3 /I"${temporary}" "${path.join(temporary, "main.c")}" /Fe:"${executable}" /Fo:"${path.join(temporary, "main.obj")}"\r\nexit /b %errorlevel%\r\n`);
      compiled = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", batch], { cwd: temporary, encoding: "utf8", timeout: 120000 });
    } else {
      compiled = spawnSync(process.env.CC || "cc", ["-std=c11", "-Wall", "-Werror=incompatible-pointer-types", "-I" + temporary, path.join(temporary, "main.c"), "-lm", "-o", executable], { encoding: "utf8", timeout: 120000 });
    }
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const result = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    {
      const headers = path.join(os.homedir(), ".cache", "node-gyp", process.versions.node, "include", "node");
      fs.mkdirSync(path.join(temporary, "build", "Release"), { recursive: true });
      fs.writeFileSync(path.join(temporary, "kernel.c"), generateC(ir));
      const addon = path.join(temporary, "build", "Release", "sagejs_native_kernel.node");
      let buildAddon;
      if (process.platform === "linux" && fs.existsSync(path.join(headers, "node_api.h"))) {
        buildAddon = spawnSync(process.env.CC || "cc", ["-std=c11", "-shared", "-fPIC", "-DNAPI_VERSION=8", "-I" + temporary, "-I" + headers, path.join(temporary, "kernel.c"), "-lm", "-o", addon], { encoding: "utf8", timeout: 120000 });
      } else {
        fs.writeFileSync(path.join(temporary, "binding.gyp"), JSON.stringify({ targets: [{
          target_name: "sagejs_native_kernel", sources: ["kernel.c"],
          defines: ["NAPI_VERSION=8"], include_dirs: ["."], cflags: ["-std=c11"],
          msvs_settings: { VCCLCompilerTool: { AdditionalOptions: ["/std:c11"] } },
        }] }));
        const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", { paths: [path.resolve(__dirname, "../packages/flint")] });
        buildAddon = spawnSync(process.execPath, [nodeGyp, "rebuild", "--directory", temporary], { encoding: "utf8", timeout: 120000 });
      }
      assert.equal(buildAddon.status, 0, buildAddon.stderr);
      const nativeCheck = spawnSync(process.execPath, ["-e", `
        const assert = require('node:assert/strict');
        const checked = require('./dynamic.cjs').checked;
        assert.equal(checked.nativeAvailable, true);
        for (const invalid of ['1', true, null, {valueOf() {throw Error('user hook');}}]) {
          assert.throws(() => checked([0], [invalid], 1, 0), /binary64 float/);
        }
        for (const input of [[1, -2, 3], new Float64Array([1, -2, 3])]) {
          assert.equal(checked(input, input, 3, 0), true);
          assert.deepEqual([...input], [2, -4, 6]);
          assert.throws(() => checked(input, input, 2, 0), /length/);
          assert.deepEqual([...input], [2, -4, 6]);
          assert.throws(() => checked(input, input, 3, 1), /rejected witness/);
          assert.deepEqual([...input], [2, -4, 6]);
        }
      `], { cwd: temporary, encoding: "utf8" });
      assert.equal(nativeCheck.status, 0, nativeCheck.stderr);
      const runtimeProgram = path.join(temporary, "runtime.py");
      fs.writeFileSync(runtimeProgram, `import sagejs.runtime as runtime
def call(output, source, reject):
    return runtime.ffi_call(
        "witness@${"0".repeat(64)}:checked", ${JSON.stringify(dynamicPath)}, "checked",
        [output, source, 3, reject], ["Float64Buffer", "Float64Buffer", "uint64", "uint64"],
        "bool", ["status", [1], None], "RuntimeError", "rejected witness", [],
    )
values = [1.0, -2.0, 3.0]
assert call(values, values, 0)
assert values == [2.0, -4.0, 6.0]
try:
    call(values, values, 1)
except RuntimeError:
    pass
else:
    raise AssertionError("failed call returned success")
assert values == [2.0, -4.0, 6.0]
`);
      const runtimeCheck = spawnSync(process.execPath, [path.resolve(__dirname, "../bin/sagejs"), "--python", runtimeProgram], {
        cwd: temporary, encoding: "utf8", timeout: 60000,
      });
      assert.equal(runtimeCheck.status, 0, runtimeCheck.stderr);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
