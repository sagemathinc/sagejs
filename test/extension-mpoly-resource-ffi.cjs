// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerCompilerFlag, sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "sagejs-fq-mpoly-witness-"));
const source = join(root, "packages/flint/test/fq_mpoly_resource_ffi.c");
const wasm = process.argv.includes("--wasm");
const sanitize = !wasm && process.platform !== "win32" && process.env.SAGEJS_FFI_SANITIZE === "1";
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native",
  process.platform === "win32" ? "vcpkg-installed/x64-windows-static-md-release" : "prefix"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 120000, ...options,
  });
  assert.equal(result.status, 0,
    result.stdout + result.stderr + (result.error ? String(result.error) : ""));
  return result.stdout;
}

try {
  let executable = join(temporary, "witness");
  let output;
  if (wasm) {
    const { resolveToolchain } = require("../packages/wasm-toolchain/scripts/toolchain.cjs");
    const toolchain = resolveToolchain({ root });
    assert.equal(toolchain.ready, true, "prepare the locked Wasm toolchain before this qualification");
    const libraries = ["flint", "mpfr", "gmp"].map(name => toolchain.paths.libraries[name]);
    executable += ".wasm";
    run(toolchain.paths.clang, ["--target=wasm32-wasip1", "--sysroot=" + toolchain.paths.sysroot,
      "-Oz", "-Wl,-z,stack-size=8388608", "-Wl,--strip-all", "-Wl,--max-memory=536870912",
      "-I" + join(root, "packages/flint/include"),
      ...libraries.map(library => "-I" + join(library.prefix, "include")),
      source, join(root, "packages/flint-wasm/src/wasi-stubs.c"),
      ...libraries.map(library => join(library.prefix, "lib", library.archiveName)),
      "-lm", "-lwasi-emulated-signal", "-o", executable]);
    output = run(process.execPath, ["-e", `
      const {WASI}=require('node:wasi');
      const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{}});
      const module=new WebAssembly.Module(require('node:fs').readFileSync(process.argv[1]));
      wasi.start(new WebAssembly.Instance(module,wasi.getImportObject()));
    `, executable]);
  } else if (process.platform === "win32") {
    const builtins = run(process.execPath,
      [join(root, "packages/flint/scripts/windows-clang-builtins.cjs")]).trim();
    const libraries = ["flint.lib", "openblas.lib", "mpc.lib", "mpfr.lib", "gmp.lib", "pthreadVC3.lib"]
      .map(name => join(prefix, "lib", name));
    writeFileSync(join(temporary, "binding.gyp"), JSON.stringify({targets:[{
      target_name: "witness", type: "executable", sources: [source],
      include_dirs: [join(root, "packages/flint/include"), join(prefix, "include")],
      defines: ["_CRT_SECURE_NO_WARNINGS"], libraries: [...libraries, builtins],
      configurations: {Release:{msbuild_toolset:"ClangCL",
        msvs_settings:{VCCLCompilerTool:{RuntimeLibrary:2}}}},
      msvs_settings:{VCCLCompilerTool:{Optimization:2,WarningLevel:3}},
    }]}));
    const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {paths:[join(root,"packages/flint")]});
    run(process.execPath, [nodeGyp, "rebuild", "--release"], {cwd:temporary});
    output = run(join(temporary, "build/Release/witness.exe"), []);
  } else {
    run(process.env.CC || "cc", ["-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
      ...(sanitize ? ["-fno-omit-frame-pointer", sanitizerCompilerFlag()] : []),
      "-I" + join(root, "packages/flint/include"), "-I" + join(prefix, "include"), source,
      ...["flint", "openblas", "mpfr", "gmp"].map(name => join(prefix, "lib", `lib${name}.a`)),
      "-lm", "-lpthread", "-o", executable]);
    output = run(executable, [], {env:{...(sanitize ? sanitizerEnvironment() : process.env), OPENBLAS_NUM_THREADS:"1"}});
  }
  assert.match(output, /finite-extension multivariate canonical transfer and lifetime checks passed/);
  console.log(JSON.stringify({schema:"sagejs.fq-mpoly-witness/v1", target:wasm ? "standalone-wasm" : process.platform+"-"+process.arch,
    sanitizers:sanitize, publicDispatch:false, productionArtifact:false, status:"passed"}));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
