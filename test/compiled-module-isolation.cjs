"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const {
  analyzeBaselibModules,
  moduleId,
} = require("../tools/baselib-modules.cjs");

const root = join(__dirname, "..");

function findFile(directory, predicate) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, predicate);
      if (found) return found;
    } else if (predicate(entry.name)) {
      return path;
    }
  }
  return null;
}

function moduleFixture(filename, exports, references = []) {
  return { filename, exports, references };
}

test("baselib symbol analysis rejects accidental shared namespaces", () => {
  const privateAnalysis = analyzeBaselibModules([
    moduleFixture("alpha.py", ["public_alpha", "_helper"]),
    moduleFixture("beta.py", ["public_beta", "_helper"]),
  ]);
  assert.deepEqual(privateAnalysis.duplicatePrivate.get("_helper"), [
    "alpha.py",
    "beta.py",
  ]);
  assert.ok(!privateAnalysis.facadeNames.includes("_helper"));
  assert.deepEqual(privateAnalysis.facadeNames, ["public_alpha", "public_beta"]);

  assert.throws(
    () =>
      analyzeBaselibModules([
        moduleFixture("alpha.py", ["answer"]),
        moduleFixture("beta.py", ["answer"]),
      ]),
    /duplicate public baselib symbols: answer: alpha\.py, beta\.py/,
  );
  assert.throws(
    () =>
      analyzeBaselibModules([
        moduleFixture("alpha.py", ["_helper"]),
        moduleFixture("beta.py", ["_helper"]),
        moduleFixture("consumer.py", ["consume"], ["_helper"]),
      ]),
    /ambiguous private baselib reference consumer\.py:_helper/,
  );
  assert.equal(moduleId("matrix.py"), "sagejs._baselib.matrix");
  assert.throws(() => moduleId("matrix.cjs"), /not Python source/);
});

test("generated baselib gives every source file one lexical module", () => {
  const generated = readFileSync(
    join(root, "dist/compiler/baselib-plain-pretty.js"),
    "utf8",
  );
  const filenames = readdirSync(join(root, "src", "baselib"))
    .filter((name) => name.endsWith(".py"))
    .sort();

  assert.match(
    generated,
    /^var ρσ_baselib_modules = Object\.create\(null\);\n/m,
  );
  assert.match(
    generated,
    /globalThis\.__sagejs_baselib_modules__ = ρσ_baselib_modules;/,
  );
  const firstWrapper = generated.indexOf(" = (function() {");
  assert.ok(
    firstWrapper > 0,
    "the generated baselib must contain module wrappers",
  );
  for (const filename of filenames) {
    const rawId = moduleId(filename);
    const id = rawId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.ok(
      generated.indexOf(`ρσ_baselib_modules["${rawId}"] = Object.create(null);`) <
        firstWrapper,
      `${filename} must enter the module cache before initialization`,
    );
    const matches = generated.match(
      new RegExp(`ρσ_baselib_modules\\["${id}"\\] = \\(function\\(\\) \\{`, "g"),
    );
    assert.equal(matches?.length, 1, `${filename} must have one lexical wrapper`);
  }
  assert.doesNotMatch(
    generated,
    /^_PLOTLY_MIME = ρσ_baselib_modules\[/m,
    "a repeated private name must never escape through the shared facade",
  );
  assert.doesNotMatch(
    readFileSync(join(root, "src", "baselib", "graphs.py"), "utf8"),
    /sorts before this module in the concatenated baselib build/,
  );
});

test(
  "all baselib modules have stable Python identity and introspection",
  async (t) => {
    const session = await createSage({ mode: "python" });
    t.after(() => session.close());
    const names = readdirSync(join(root, "src", "baselib"))
      .filter((name) => name.endsWith(".py"))
      .map((name) => moduleId(name));
    const namesLiteral = JSON.stringify(names);
    const result = await session.evaluate(
      [
        "import types",
        `names = ${namesLiteral}`,
        "modules = [get_module(name) for name in names]",
        "print(len(modules))",
        "print(all(module is get_module(name) for name, module in zip(names, modules)))",
        "print(all(module.__name__ == name for name, module in zip(names, modules)))",
        "print(all(module.__package__ == 'sagejs._baselib' for module in modules))",
        "print(all(module.__spec__['name'] == name for name, module in zip(names, modules)))",
        "print(all(repr(module) == \"<module '\" + name + \"'>\" for name, module in zip(names, modules)))",
        "print(all(isinstance(module, types.ModuleType) for module in modules))",
        "matrix_module = get_module('sagejs._baselib.matrix')",
        "polynomial_module = get_module('sagejs._baselib.polynomial')",
        "print(matrix_module._integer_buffer_values is not polynomial_module._integer_buffer_values)",
        "print(random_matrix.__module__)",
        "print(random_matrix.__globals__ is matrix_module.__dict__)",
        "print(random_matrix.__globals__ is random_matrix.__globals__)",
        "print(random_matrix.__code__ is random_matrix.__code__)",
        "print(type(random_matrix) is types.FunctionType)",
        "print(all(type(value) is type for value in (int, bool, float, type, tuple, property, str, list, dict, set, frozenset)))",
        "print(type(PolynomialRing(GF(5), 'x')) is PolynomialRingParent)",
        "reference_module = get_module('sagejs._baselib.graph_reference_data')",
        "imported_reference = __import__('sagejs._baselib.graph_reference_data', None, None, ['_GRAPH_REFERENCE_RECORDS'])",
        "print(reference_module is imported_reference)",
        "graphs_module = get_module('sagejs._baselib.graphs')",
        "graphics_module = get_module('sagejs._baselib.graphics')",
        "old_graph_mime = graphs_module._PLOTLY_MIME",
        "graphs_module._PLOTLY_MIME = 'application/x-sagejs-isolation-test'",
        "print(Graph().graphplot()._rich_repr_().mime)",
        "print(graphics_module._PLOTLY_MIME == old_graph_mime)",
        "graphs_module._PLOTLY_MIME = old_graph_mime",
      ].join("\n"),
    );

    assert.equal(
      result.stdout.trim(),
      [
        String(names.length),
        "True",
        "True",
        "True",
        "True",
        "True",
        "True",
        "True",
        "sagejs._baselib.matrix",
        "True",
        "True",
        "True",
        "True",
        "True",
        "True",
        "True",
        "application/x-sagejs-isolation-test",
        "True",
      ].join("\n"),
    );
  },
);

test("kernel cells share one live __main__ module namespace", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate("import sagejs.runtime as runtime\nimport __main__");
  await session.evaluate("value = 10");
  await session.evaluate(
    "def make_reader(offset):\n" +
      "    def read(argument):\n" +
      "        return value + offset + argument\n" +
      "    return read",
  );
  await session.evaluate("reader = make_reader(2)\nvalue = 20");
  await session.evaluate(
    "class CurrentValue:\n" +
      "    def read(self):\n" +
      "        return value",
  );

  assert.equal(
    (await session.evaluate(
      "runtime.reflect.get(__main__, 'value'), reader(3), " +
        "CurrentValue().read(), __main__.CurrentValue is CurrentValue, " +
        "__name__, __main__.__name__",
    )).repr,
    "(20, 25, 20, True, '__main__', '__main__')",
  );
  assert.equal(
    (await session.evaluate("__main__ is __import__('__main__')")).repr,
    "True",
  );
  await session.evaluate("__main__.value = 99");
  assert.equal((await session.evaluate("value")).repr, "99");
  await session.evaluate("ρσ_module_value = 7");
  await session.evaluate("__main__.ρσ_module_value = 8");
  assert.equal((await session.evaluate("ρσ_module_value")).repr, "8");
  await session.evaluate("__name__ = 'changed-main-name'");
  assert.equal(
    (await session.evaluate("(__name__, __main__.__name__)")).repr,
    "('changed-main-name', 'changed-main-name')",
  );
  await session.evaluate("__main__.created_from_module = 41");
  assert.equal(
    (await session.evaluate(
      "created_from_module + 1, " +
        "globals()['created_from_module'] is __main__.created_from_module, " +
        "locals()['created_from_module'] is __main__.created_from_module, " +
        "vars()['created_from_module'] is __main__.created_from_module, " +
        "'created_from_module' in dir()",
    )).repr,
    "(42, True, True, True, True)",
  );
  await session.evaluate("del __main__.value");
  assert.equal(
    (await session.evaluate(
      "hasattr(__main__, 'value'), 'value' in globals(), 'value' in dir()",
    )).repr,
    "(False, False, False)",
  );
  await assert.rejects(
    session.evaluate("value"),
    /value.*(?:not defined|referenced before assignment)|NameError/,
  );
  await session.evaluate("dictionary_value = 17");
  await session.evaluate("del globals()['dictionary_value']");
  assert.equal(
    (await session.evaluate(
      "hasattr(__main__, 'dictionary_value'), " +
        "'dictionary_value' in globals(), 'dictionary_value' in dir()",
    )).repr,
    "(False, False, False)",
  );
  await assert.rejects(
    session.evaluate("dictionary_value"),
    /dictionary_value.*(?:not defined|referenced before assignment)|NameError/,
  );
  await session.evaluate(
    "restored = 1\n" +
      "def restore():\n" +
      "    global restored\n" +
      "    restored = 22\n" +
      "del restored",
  );
  assert.equal(
    (await session.evaluate(
      "hasattr(__main__, 'restored'), 'restored' in globals(), " +
        "'restored' in dir()",
    )).repr,
    "(False, False, False)",
  );
  await session.evaluate("restore()");
  assert.equal(
    (await session.evaluate(
      "restored, __main__.restored, globals()['restored'], " +
        "'restored' in dir()",
    )).repr,
    "(22, 22, 22, True)",
  );
  await session.evaluate("runtime = 'shadowed'");
  assert.equal((await session.evaluate("runtime")).repr, "'shadowed'");
});

test("kernel cells initialize magic globals once", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate("import __main__");
  await session.evaluate(
    "__name__ = 'custom-main'\n" +
      "__package__ = 'custom.package'\n" +
      "__file__ = 'custom.py'\n" +
      "__loader__ = 'custom-loader'\n" +
      "__spec__ = 'custom-spec'\n" +
      "__cached__ = 'custom-cache'",
  );
  assert.equal(
    (await session.evaluate(
      "(__name__, __package__, __file__, __loader__, __spec__, __cached__) == " +
        "(__main__.__name__, __main__.__package__, __main__.__file__, " +
        "__main__.__loader__, __main__.__spec__, __main__.__cached__)",
    )).repr,
    "True",
  );
  assert.equal(
    (await session.evaluate(
      "__name__, __package__, __file__, __loader__, __spec__, __cached__",
    )).repr,
    "('custom-main', 'custom.package', 'custom.py', 'custom-loader', " +
      "'custom-spec', 'custom-cache')",
  );
  await session.evaluate("del __package__");
  assert.equal(
    (await session.evaluate(
      "hasattr(__main__, '__package__'), '__package__' in globals(), " +
        "'__package__' in dir(), __name__, __file__",
    )).repr,
    "(False, False, False, 'custom-main', 'custom.py')",
  );
});

test("kernel live namespace accessors preserve an arguments global", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate("arguments = 'lexical-value'\nimport __main__");
  assert.equal(
    (await session.evaluate("arguments, __main__.arguments")).repr,
    "('lexical-value', 'lexical-value')",
  );
  await session.evaluate("__main__.arguments = 'module-write'");
  assert.equal(
    (await session.evaluate("arguments, __main__.arguments")).repr,
    "('module-write', 'module-write')",
  );
  await session.evaluate(
    "def write_arguments():\n" +
      "    global arguments\n" +
      "    arguments = 'global-write'",
  );
  await session.evaluate("write_arguments()");
  assert.equal(
    (await session.evaluate("arguments, __main__.arguments")).repr,
    "('global-write', 'global-write')",
  );
});

test("kernel intrinsic aliases follow later Python bindings", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate("import sagejs.runtime as runtime");
  assert.equal((await session.evaluate("runtime.reflect is not None")).repr, "True");
  await session.evaluate(
    "def parameter_shadow(runtime):\n" +
      "    return runtime.upper()\n" +
      "def local_shadow():\n" +
      "    runtime = 'local-shadow'\n" +
      "    return runtime.upper()\n" +
      "def closure_shadow():\n" +
      "    runtime = 'closure-shadow'\n" +
      "    def read():\n" +
      "        return runtime.upper()\n" +
      "    return read()\n" +
      "def comprehension_shadow():\n" +
      "    return [runtime.upper() for runtime in ['comprehension-shadow']]\n" +
      "class RuntimeContext:\n" +
      "    marker = 'with-shadow'\n" +
      "    def __enter__(arbitrary_receiver):\n" +
      "        return arbitrary_receiver.marker\n" +
      "    def __exit__(self, kind, value, traceback):\n" +
      "        return False\n" +
      "def with_shadow():\n" +
      "    with RuntimeContext() as runtime:\n" +
      "        return runtime.upper()\n" +
      "def exception_shadow():\n" +
      "    try:\n" +
      "        raise ValueError('exception-shadow')\n" +
      "    except ValueError as runtime:\n" +
      "        return runtime.args[0]\n" +
      "def exception_target_is_deleted():\n" +
      "    try:\n" +
      "        raise ValueError('deleted-target')\n" +
      "    except ValueError as caught:\n" +
      "        pass\n" +
      "    try:\n" +
      "        caught\n" +
      "    except NameError:\n" +
      "        return True\n" +
      "    return False\n" +
      "def match_shadow():\n" +
      "    match 'match-shadow':\n" +
      "        case runtime:\n" +
      "            return runtime.upper()\n" +
      "class ClassShadow:\n" +
      "    runtime = 'class-shadow'\n" +
      "    value = runtime.upper()\n" +
      "class ClassImport:\n" +
      "    import sagejs.runtime as runtime\n" +
      "    value = runtime.reflect is not None\n" +
      "def nested_class_shadow():\n" +
      "    class Nested:\n" +
      "        runtime = 'nested-class-shadow'\n" +
      "        value = runtime.upper()\n" +
      "    return Nested.value",
  );
  assert.equal(
    (await session.evaluate(
      "parameter_shadow('parameter-shadow'), local_shadow(), " +
        "closure_shadow(), comprehension_shadow(), with_shadow(), " +
        "exception_shadow(), exception_target_is_deleted(), match_shadow(), ClassShadow.value, " +
        "ClassImport.value, nested_class_shadow()",
    )).repr,
    "('PARAMETER-SHADOW', 'LOCAL-SHADOW', 'CLOSURE-SHADOW', " +
      "['COMPREHENSION-SHADOW'], 'WITH-SHADOW', 'exception-shadow', " +
      "True, 'MATCH-SHADOW', 'CLASS-SHADOW', True, 'NESTED-CLASS-SHADOW')",
  );
  await session.evaluate(
    "for runtime in ['loop-shadow']:\n" +
      "    loop_result = runtime.upper()",
  );
  assert.equal(
    (await session.evaluate("runtime, loop_result")).repr,
    "('loop-shadow', 'LOOP-SHADOW')",
  );
  await session.evaluate("def runtime():\n    return 'function-shadow'");
  assert.equal((await session.evaluate("runtime()")).repr, "'function-shadow'");

  await session.evaluate("import sagejs.runtime as rebound");
  await session.evaluate("rebound = 'direct-shadow'\nrebound_result = rebound.upper()");
  assert.equal(
    (await session.evaluate("rebound, rebound_result")).repr,
    "('direct-shadow', 'DIRECT-SHADOW')",
  );

  await session.evaluate("import sagejs.runtime as low_level");
  await session.evaluate("del low_level");
  await assert.rejects(
    session.evaluate("low_level.reflect"),
    /low_level|AttributeError|NameError/,
  );

  await session.evaluate("import sagejs.runtime as runtime\nimport __main__");
  await session.evaluate("__main__.runtime = 'module-shadow'");
  assert.equal((await session.evaluate("runtime.upper()")).repr, "'MODULE-SHADOW'");
  await assert.rejects(
    session.evaluate("runtime.reflect"),
    /attribute.*reflect|AttributeError/i,
  );
  await session.evaluate("import sagejs.runtime as runtime");
  await session.evaluate("globals()['runtime'] = 'dictionary-shadow'");
  assert.equal(
    (await session.evaluate("runtime.upper()")).repr,
    "'DICTIONARY-SHADOW'",
  );
  await assert.rejects(
    session.evaluate("runtime.reflect"),
    /attribute.*reflect|AttributeError/i,
  );
});

test("kernel namespace metadata cannot collide with Python globals", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate("import sagejs.runtime as runtime\nimport __main__");
  await session.evaluate(
    "host_prototype = runtime.object.getPrototypeOf(runtime.global_object)",
  );
  await session.evaluate("__main__.__proto__ = {'polluted': 1}");
  assert.equal(
    (await session.evaluate(
      "runtime.object.getPrototypeOf(runtime.global_object) is host_prototype, " +
        "__main__.__proto__['polluted']",
    )).repr,
    "(True, 1)",
  );

  await session.evaluate(
    "__proto__ = 17\n" +
      "__sagejs_reusable_main__ = 18\n" +
      "__sagejs_main_magic_initialized__ = 19\n" +
      "__sagejs_live_scope_dict__ = 20\n" +
      "import __main__",
  );
  assert.equal(
    (await session.evaluate(
      "(__proto__, __main__.__proto__, globals()['__proto__'], " +
        "__sagejs_reusable_main__, __sagejs_main_magic_initialized__, " +
        "__sagejs_live_scope_dict__, globals() is globals())",
    )).repr,
    "(17, 17, 17, 18, 19, 20, True)",
  );
  await session.evaluate("__main__.__proto__ = 23");
  assert.equal(
    (await session.evaluate(
      "__proto__, globals()['__proto__'], '__proto__' in dir()",
    )).repr,
    "(23, 23, True)",
  );
});

test("kernel namespace builtins follow persistent rebinding", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate(
    "globals = lambda: 'globals-shadow'\n" +
      "locals = lambda: 'locals-shadow'\n" +
      "vars = lambda: 'vars-shadow'\n" +
      "dir = lambda: ['dir-shadow']",
  );
  assert.equal(
    (await session.evaluate("globals(), locals(), vars(), dir()")).repr,
    "('globals-shadow', 'locals-shadow', 'vars-shadow', ['dir-shadow'])",
  );
});

test("kernel Python globals cannot overwrite host or compiler bindings", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  await session.evaluate(
    "import sagejs.runtime as runtime\n" +
      "host_names = ['Object', 'Reflect', 'Symbol', 'globalThis', 'Math', 'Map', 'console']\n" +
      "host_values = [runtime.reflect.get(runtime.global_object, name) for name in host_names]",
  );
  await session.evaluate(
    "Object = 'Object-value'\n" +
      "Reflect = 'Reflect-value'\n" +
      "Symbol = 'Symbol-value'\n" +
      "globalThis = 'globalThis-value'\n" +
      "Math = 'Math-value'\n" +
      "Map = 'Map-value'\n" +
      "console = 'console-value'\n" +
      "ρσ_modules = 'registry-value'\n" +
      "ordinary_name = 'ordinary-value'",
  );
  assert.equal(
    (await session.evaluate(
      "Object, Reflect, Symbol, globalThis, Math, Map, console, ρσ_modules, ordinary_name",
    )).repr,
    "('Object-value', 'Reflect-value', 'Symbol-value', 'globalThis-value', " +
      "'Math-value', 'Map-value', 'console-value', 'registry-value', 'ordinary-value')",
  );
  assert.equal(
    (await session.evaluate(
      "all(runtime.reflect.get(runtime.global_object, name) is value " +
        "for name, value in zip(host_names, host_values))",
    )).repr,
    "True",
  );
  await session.evaluate(
    "def read_collisions():\n" +
      "    return Object, Reflect, ρσ_modules, console\n" +
      "def parameter_and_closure(Object):\n" +
      "    Math = 'local-Math'\n" +
      "    def inner():\n" +
      "        return Object, Math\n" +
      "    return inner\n" +
      "def mutate_global():\n" +
      "    global Object\n" +
      "    Object = 'mutated-Object'",
  );
  assert.equal(
    (await session.evaluate(
      "read_collisions(), parameter_and_closure('parameter-Object')()",
    )).repr,
    "(('Object-value', 'Reflect-value', 'registry-value', 'console-value'), " +
      "('parameter-Object', 'local-Math'))",
  );
  await session.evaluate("mutate_global()\ndel Reflect");
  assert.equal((await session.evaluate("Object")).repr, "'mutated-Object'");
  await assert.rejects(session.evaluate("Reflect"), /Reflect|NameError/);
  assert.equal(
    (await session.evaluate(
      "runtime.reflect.get(runtime.global_object, 'Reflect') is host_values[1]",
    )).repr,
    "True",
  );
});

test("ordinary compiled imports preserve globals, closures, and cache identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-module-isolation-"));
  try {
    writeFileSync(
      join(directory, "alpha.py"),
      [
        "value = 10",
        "def read(): return value",
        "def write(new_value):",
        "    global value",
        "    value = new_value",
        "def factory(offset):",
        "    def inner(argument):",
        "        return value + offset + argument",
        "    return inner",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "beta.py"),
      "value = 99\ndef read(): return value\n",
    );
    writeFileSync(
      join(directory, "collisions.py"),
      [
        "Object = 37",
        "ρσ_modules = 38",
        "console = 39",
        "Reflect = 40",
        "def read(): return Object, ρσ_modules, console, Reflect",
        "def parameter(Object): return Object",
        "def closure(Math):",
        "    def inner(): return Math",
        "    return inner",
        "def Map(Map): return Map",
        "class Symbol:",
        "    marker = 41",
        "    def read(self): return self.marker",
        "class KodairaSymbol:",
        "    def code(self): return 42",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "cycle_a.py"),
      [
        "value = 'a-start'",
        "import cycle_b",
        "value = 'a-done'",
        "def seen(): return cycle_b.seen_a",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "cycle_b.py"),
      [
        "import cycle_a",
        "seen_a = cycle_a.value",
        "def current(): return cycle_a.value",
        "",
      ].join("\n"),
    );
    mkdirSync(join(directory, "package_root", "child"), { recursive: true });
    writeFileSync(join(directory, "package_root", "__init__.py"), "");
    writeFileSync(join(directory, "package_root", "child", "__init__.py"), "");
    writeFileSync(
      join(directory, "package_root", "child", "leaf.py"),
      "value = 46\n",
    );
    writeFileSync(
      join(directory, "main.py"),
      [
        "import alpha",
        "import alpha as alpha_again",
        "import beta",
        "import collisions",
        "print(alpha is alpha_again)",
        "print(alpha.__name__, alpha.__package__, repr(alpha))",
        "print(alpha.read(), beta.read())",
        "print(collisions.read())",
        "print(collisions.parameter(42), collisions.closure(43)())",
        "print(collisions.Map(44))",
        "print(collisions.Symbol.__name__, collisions.Symbol.__qualname__, collisions.Symbol().read())",
        "print(collisions.KodairaSymbol().code())",
        "print(collisions.read.__globals__ is collisions.__dict__)",
        "closure = alpha.factory(2)",
        "alpha.write(30)",
        "print(alpha.read(), beta.read(), closure(3))",
        "alpha.write(40)",
        "print(closure(3))",
        "print(alpha.read.__module__)",
        "print(alpha.read.__globals__ is alpha.__dict__)",
        "print(alpha.read.__code__ is alpha.read.__code__)",
        "Dynamic = type('Dynamic', (object,), {})",
        "print(type(Dynamic) is type, type(Dynamic()) is Dynamic)",
        "import cycle_a",
        "import cycle_b",
        "print(cycle_a.seen(), cycle_b.current(), cycle_a is cycle_b.cycle_a)",
        "import package_root.child.leaf",
        "print(package_root.child.leaf.value)",
        "",
      ].join("\n"),
    );
    const result = spawnSync(join(root, "bin", "sagejs"), ["main.py"], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      [
        "True",
        "alpha  <module 'alpha'>",
        "10 99",
        "(37, 38, 39, 40)",
        "42 43",
        "44",
        "Symbol Symbol 41",
        "42",
        "True",
        "30 99 35",
        "45",
        "alpha",
        "True",
        "True",
        "True True",
        "a-start a-done True",
        "46",
      ].join("\n"),
    );

    const cacheDirectory = join(directory, "module-cache");
    const compileResult = spawnSync(
      join(root, "bin", "sagejs"),
      [
        "compile",
        "--cache-dir",
        cacheDirectory,
        "--output",
        join(directory, "main.js"),
        "main.py",
      ],
      { cwd: directory, encoding: "utf8" },
    );
    assert.equal(compileResult.status, 0, compileResult.stderr);
    const compiledMain = readFileSync(join(directory, "main.js"), "utf8");
    assert.match(
      compiledMain,
      /\$ρσ\$py\$package_root\["child"\]\["leaf"\]\s*=\s*ρσ_modules\["package_root\.child\.leaf"\]/,
    );
    assert.doesNotMatch(
      compiledMain,
      /(?:^|[;{}]\s*)package_root\.child\s*=\s*\rho\sigma_modules/m,
    );
    const collisionCache = findFile(
      cacheDirectory,
      (name) => name.includes("collisions.py") && name.endsWith(".json"),
    );
    assert.ok(collisionCache, "the collision fixture must produce a module cache");
    const cached = JSON.parse(readFileSync(collisionCache, "utf8"));
    for (const generated of Object.values(cached.outputs)) {
      assert.match(
        generated,
        /var\s+\$ρσ\$py\$Symbol\s*=\s*function\s+\$ρσ\$py\$Symbol/,
      );
      assert.doesNotMatch(generated, /var\s+Symbol\s*=\s*function\s+Symbol/);
      assert.match(
        generated,
        /var\s+\$ρσ\$py\$Map\s*=\s*function\s+\$ρσ\$py\$Map/,
      );
      assert.doesNotMatch(generated, /var\s+Map\s*=\s*function\s+Map/);
      assert.match(generated, /\$ρσ\$py\$Symbol\.prototype\.read/);
      assert.match(generated, /\$ρσ\$py\$Map\.__name__/);
      assert.match(
        generated,
        /var\s+\$ρσ\$py\$KodairaSymbol\s*=\s*function\s+\$ρσ\$py\$KodairaSymbol/,
      );
      assert.doesNotMatch(
        generated,
        /var\s+KodairaSymbol\s*=\s*function\s+KodairaSymbol/,
      );
      assert.match(generated, /\$ρσ\$py\$KodairaSymbol\.prototype\.code/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
