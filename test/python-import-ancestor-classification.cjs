// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

test("private compiler import guards preserve missing and mutable bindings", async () => {
  const root = path.join(__dirname, "..");
  const compiler = require(root).createCompiler();
  const frontend = await require("../dist/tools/python/compiler-frontend.js").createPythonCompilerFrontend(compiler, "python");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-import-guard-"));
  fs.writeFileSync(path.join(directory, "binding.py"), "value = 'seven'\n");
  function compile(source, bootstrap = true, options = {}) {
    const ast = frontend.parse(source, { filename: path.join(directory, "probe.py"), basedir: directory, compiler_bootstrap: bootstrap });
    const output = new compiler.OutputStream({ beautify: true, omit_baselib: true, private_compiler_import_reads: true, ...options });
    ast.print(output);
    return output.get();
  }
  const direct = "from binding import value\ndef read():\n    return value\n";
  try {
    execFileSync(process.env.PYTHON || "python3", ["-c", "def before():\n    return value\ntry:\n    before()\nexcept NameError:\n    pass\nelse:\n    raise AssertionError('missing NameError')\nfrom binding import value\nassert before() == 'seven'\nglobals()['value'] = 'changed'\nassert before() == 'changed'\ndel globals()['value']\ntry:\n    before()\nexcept NameError:\n    pass\nelse:\n    raise AssertionError('deleted binding survived')\n"], { cwd: directory });
    const guarded = compile(direct);
    assert.match(guarded, /ρσ_is_missing_binding\(value\) \? ρσ_resolve_module_name/);
    assert.match(compile("from binding import value as alias\ndef read():\n    return alias\n"), /ρσ_is_missing_binding\(alias\) \? ρσ_resolve_module_name/);
    assert.match(compile("import binding\ndef read():\n    return binding.value\n"), /ρσ_is_missing_binding\(binding\) \? ρσ_resolve_module_name/);
    for (const [source, bootstrap, options] of [
      [direct, false, {}],
      [direct, true, { private_compiler_import_reads: false }],
      [direct, true, { reuse_main_module: true }],
      ["if True:\n    from binding import value\ndef read():\n    return value\n", true, {}],
      ["try:\n    from binding import value\nexcept ImportError:\n    pass\ndef read():\n    return value\n", true, {}],
      ["for n in [1]:\n    from binding import value\ndef read():\n    return value\n", true, {}],
      ["with manager:\n    from binding import value\ndef read():\n    return value\n", true, {}],
      ["def read():\n    from binding import value\n    return value\n", true, {}],
      ["from binding import *\ndef read():\n    return value\n", true, {}],
    ]) assert.doesNotMatch(compile(source, bootstrap, options), /ρσ_is_missing_binding\(value\) \?/);
    const shadow = compile("from binding import value\ndef read(value):\n    return value\n");
    assert.doesNotMatch(shadow, /ρσ_is_missing_binding\(value\) \?/);
    const cachedDirectory = path.join(directory, "cache");
    fs.mkdirSync(cachedDirectory);
    assert.doesNotMatch(compile(direct, true, { module_cache_dir: cachedDirectory }), /ρσ_is_missing_binding\(value\) \?/);
    fs.writeFileSync(path.join(directory, "first.py"), direct);
    fs.writeFileSync(path.join(directory, "second.py"), "name = 'cached'\n");
    const graph = frontend.parse("import first\nimport second\nif True:\n    from binding import value\ndef read():\n    return value\n", {
      filename: path.join(directory, "graph.py"), basedir: directory, compiler_bootstrap: true,
    });
    const marker = "/* cached-state-probe */";
    graph.imports.second.is_cached = true;
    graph.imports.second.outputs = { "beautify:true keep_docstrings:false": marker };
    const graphOutput = new compiler.OutputStream({ beautify: true, omit_baselib: true, private_compiler_import_reads: true });
    const originalPrint = graphOutput.print;
    let sawCached = false;
    graphOutput.print = function(value) {
      if (value === marker) {
        sawCached = true;
        assert.deepEqual(Object.keys(this.private_lexical_import_names), []);
      }
      return originalPrint.apply(this, arguments);
    };
    graph.print(graphOutput);
    assert.equal(sawCached, true);
    // first's direct import must not authorize the conditional root import.
    const rootRead = graphOutput.get().slice(graphOutput.get().lastIndexOf("function read("));
    assert.doesNotMatch(rootRead, /ρσ_is_missing_binding\(value\) \?/);

    // Exercise the actual private compiler realm, including its three missing
    // binding sentinels and live globals implementation.
    const context = vm.createContext({ console, require, __sagejs_runtime_require__: require, exports: {},
      readfile: fs.readFileSync,
      sha1sum: value => require("node:crypto").createHash("sha1").update(value).digest("hex"),
    });
    const before = "def before():\n    return value\nmissing = False\ntry:\n    before()\nexcept NameError:\n    missing = True\n";
    const compilerSource = fs.readFileSync(path.join(root, "dist/compiler/compiler.js"), "utf8");
    assert.match(compilerSource, /ρσ_is_missing_binding\(is_node_type\)\s*\?\s*ρσ_resolve_module_name/);
    const close = compilerSource.lastIndexOf("})();");
    assert.ok(close > 0);
    // Insert the probe in the compiler's outer private runtime closure.
    const mutable = "module_name = 'one'\ndef set_name(x):\n    global module_name\n    module_name = x\ndef get_name():\n    return module_name\n";
    vm.runInContext(compilerSource.slice(0, close) + compile(before + direct + mutable) + "globalThis.probeMissing=ρσ_is_missing_binding;globalThis.probeResolve=ρσ_resolve_module_name;" + compilerSource.slice(close), context);
    const scope = context.ρσ_modules.__main__;
    assert.equal(scope.missing, true);
    assert.equal(scope.read(), "seven");
    scope.set_name("two");
    assert.equal(scope.get_name(), "two");
    const descriptor = Object.getOwnPropertyDescriptor(scope, "value");
    assert.equal(descriptor.configurable, false);
    assert.equal(typeof descriptor.set, "function");
    scope.value = "eleven";
    assert.equal(scope.read(), "eleven");
    scope.read.__globals__.__setitem__("value", "thirteen");
    assert.equal(scope.read(), "thirteen");
    scope.read.__globals__.__delitem__("value");
    assert.throws(() => scope.read(), error => String(error).includes("value"));
    scope.value = "seventeen";
    assert.equal(scope.read(), "seventeen");
    for (const [sentinelName, sentinel] of [["cleared", context.ρσ_cleared_exception], ["deleted", context.ρσ_deleted_builtin]]) {
      assert.notEqual(sentinel, undefined);
      scope.value = sentinel;
      assert.equal(context.probeMissing(sentinel), true, sentinelName + " detected");
      if (sentinelName === "cleared") {
        // The existing resolver intentionally returns this marker for an
        // outer check_unbound. Private bootstrap reads preserve that result.
        assert.equal(context.probeResolve(sentinel, "value", scope, scope.__builtins__), sentinel);
        assert.equal(scope.read(), sentinel);
      } else {
        assert.throws(() => context.probeResolve(sentinel, "value", scope, scope.__builtins__), error => String(error).includes("value"), sentinelName + " original resolver");
        assert.throws(() => scope.read(), error => String(error).includes("value"), sentinelName);
      }
    }
    fs.writeFileSync(path.join(directory, "failed.py"), "raise ImportError('deliberate import failure')\n");
    fs.writeFileSync(path.join(directory, "cycle_a.py"), "from cycle_b import value\nvalue = 'ready'\n");
    fs.writeFileSync(path.join(directory, "cycle_b.py"), "from cycle_a import value\n");
    for (const dependency of ["failed", "cycle_a"]) {
      for (const enabled of [false, true]) {
        const program = compile(`from ${dependency} import value\n`, true, { private_compiler_import_reads: enabled });
        const isolated = vm.createContext({ console, require, __sagejs_runtime_require__: require, exports: {}, readfile: fs.readFileSync,
          sha1sum: value => require("node:crypto").createHash("sha1").update(value).digest("hex"),
        });
        assert.throws(() => vm.runInContext(compilerSource.slice(0, close) + program + compilerSource.slice(close), isolated), error => String(error).includes("ImportError"), dependency + " enabled=" + enabled);
      }
    }
  } finally {
    frontend.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
