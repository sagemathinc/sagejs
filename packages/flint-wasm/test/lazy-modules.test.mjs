import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchLazyModuleBundle,
  installLazyModuleLoader,
  lazyModuleProtocol,
  validateLazyModuleBundle,
} from "../lazy-modules.mjs";

const sha1 = "1".repeat(40);
const sha256 = "2".repeat(64);

function record(
  name,
  { package: isPackage = false, dependencies = [], body = "" } = {},
) {
  const stem = `${lazyModuleProtocol.virtualRoot}/${name.replaceAll(".", "/")}`;
  const filename = isPackage ? `${stem}/__init__.py` : `${stem}.py`;
  const packagePath = isPackage ? stem : undefined;
  return {
    resource: `${name.replaceAll(".", "-")}.json`,
    resourceSha256: sha256,
    source: `${name.replaceAll(".", "/")}${isPackage ? "/__init__" : ""}.py`,
    sourceSha256: sha256,
    signature: sha1,
    version: "compiler-version",
    mode: "python",
    package: isPackage,
    filename,
    packagePath: packagePath ?? null,
    dependencies,
    javascriptTemplate: [
      `const namespace = globalThis.__sagejs_current_module_namespace__;`,
      `namespace.__file__ = ${JSON.stringify(lazyModuleProtocol.filenameMarker)};`,
      ...(isPackage
        ? [`namespace.__path__ = [${JSON.stringify(lazyModuleProtocol.packagePathMarker)}];`]
        : []),
      body,
    ].join("\n"),
  };
}

function bundle() {
  return {
    schema: lazyModuleProtocol.schema,
    generator: {
      path: "scripts/build-lazy-module-cache.cjs",
      sha256,
    },
    config: {
      path: "scripts/precompiled-python-packages.json",
      sha256,
    },
    roots: {
      package: ["demo"],
      taskRuntime: [],
    },
    modules: {
      demo: record("demo", { package: true }),
      "demo.value": record("demo.value", {
        body: "namespace.answer = 42;",
      }),
    },
  };
}

function dependencyBundle() {
  return {
    schema: lazyModuleProtocol.schema,
    generator: {
      path: "scripts/build-lazy-module-cache.cjs",
      sha256,
    },
    config: {
      path: "scripts/precompiled-python-packages.json",
      sha256,
    },
    roots: {
      package: ["platform"],
      taskRuntime: [],
    },
    modules: {
      platform: record("platform", {
        dependencies: ["platform.path"],
        body:
          "globalThis.ρσ_modules.platform = Object.assign(" +
          "Object.create(null), {answer: " +
          "globalThis.ρσ_modules['platform.path'].answer});",
      }),
      "platform.path": record("platform.path", {
        dependencies: ["support"],
        body:
          "namespace.answer = globalThis.ρσ_modules.support.answer + 1;",
      }),
      support: record("support", {
        body: "namespace.answer = 41;",
      }),
    },
  };
}

test("loads a separately fetched lazy-module bundle", async () => {
  const source = JSON.stringify(bundle());
  const loaded = await fetchLazyModuleBundle(
    `data:application/json,${encodeURIComponent(source)}`,
  );
  assert.equal(Object.keys(loaded.modules).length, 2);
  assert.equal(loaded.modules["demo.value"].javascriptTemplate.includes("42"), true);
  assert.throws(
    () => loaded.modules["demo.value"].dependencies.push("escape"),
    TypeError,
  );
});

test("installs synchronous package imports with canonical virtual paths", () => {
  const globalObject = { ρσ_modules: Object.create(null) };
  const load = installLazyModuleLoader(bundle(), {
    globalObject,
    evaluate(source) {
      Function("globalThis", source)(globalObject);
    },
  });
  const value = load("demo.value");
  assert.equal(value.answer, 42);
  assert.equal(value.__file__, "/__sagejs_lazy_modules__/demo/value.py");
  assert.deepEqual(globalObject.ρσ_modules.demo.__path__, [
    "/__sagejs_lazy_modules__/demo",
  ]);
  assert.equal(globalObject.ρσ_modules.demo.value, value);
  assert.equal(load("demo.value"), value);
});

test("loads declared dependencies before a non-package parent body", () => {
  const globalObject = { ρσ_modules: Object.create(null) };
  const load = installLazyModuleLoader(dependencyBundle(), {
    globalObject,
    evaluate(source) {
      Function("globalThis", source)(globalObject);
    },
  });
  const platform = load("platform");
  assert.equal(platform.answer, 42);
  assert.equal(platform.path, globalObject.ρσ_modules["platform.path"]);
  assert.equal(platform.path.answer, 42);
});

test("rejects noncanonical provenance before evaluating templates", () => {
  const reserved = bundle();
  reserved.modules["demo.__proto__.escape"] = record(
    "demo.__proto__.escape",
  );
  assert.throws(
    () => validateLazyModuleBundle(reserved),
    /lazy module/,
  );

  const checkoutPath = bundle();
  checkoutPath.modules["demo.value"].filename = "/home/user/source.py";
  assert.throws(
    () => validateLazyModuleBundle(checkoutPath),
    /invalid provenance/,
  );

  const maliciousDependency = bundle();
  maliciousDependency.modules.demo.dependencies = [
    "demo.__proto__.escape",
  ];
  assert.throws(
    () => validateLazyModuleBundle(maliciousDependency),
    /invalid provenance/,
  );
});

test("removes a partially initialized module after execution failure", () => {
  const failing = bundle();
  failing.modules["demo.value"] = record("demo.value", {
    body: 'throw new Error("broken template");',
  });
  const globalObject = { ρσ_modules: Object.create(null) };
  const load = installLazyModuleLoader(failing, {
    globalObject,
    evaluate(source) {
      Function("globalThis", source)(globalObject);
    },
  });
  assert.throws(() => load("demo.value"), /broken template/);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      globalObject.ρσ_modules,
      "demo.value",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(globalObject.ρσ_modules.demo, "value"),
    false,
  );
});

test("cleans a child that deletes its own registry entry", () => {
  const malicious = bundle();
  malicious.modules["demo.value"] = record("demo.value", {
    body: 'delete globalThis.ρσ_modules["demo.value"];',
  });
  const globalObject = { ρσ_modules: Object.create(null) };
  const load = installLazyModuleLoader(malicious, {
    globalObject,
    evaluate(source) {
      Function("globalThis", source)(globalObject);
    },
  });
  assert.throws(() => load("demo.value"), /did not register itself/);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      globalObject.ρσ_modules,
      "demo.value",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(globalObject.ρσ_modules.demo, "value"),
    false,
  );
});

test("publishes the final registered child object on its package", () => {
  const replacement = bundle();
  replacement.modules["demo.value"] = record("demo.value", {
    body:
      'globalThis.ρσ_modules["demo.value"] = ' +
      'Object.assign(Object.create(null), {answer: 99});',
  });
  const globalObject = { ρσ_modules: Object.create(null) };
  const load = installLazyModuleLoader(replacement, {
    globalObject,
    evaluate(source) {
      Function("globalThis", source)(globalObject);
    },
  });
  const value = load("demo.value");
  assert.equal(value.answer, 99);
  assert.equal(globalObject.ρσ_modules.demo.value, value);
});
