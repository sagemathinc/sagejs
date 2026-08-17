"use strict";

const assert = require("node:assert/strict");
const {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  createPortableSourcePaths,
} = require("../dist/tools/portable-source-paths.cjs");

const root = resolve(__dirname, "..");
const outputOptions = {
  beautify: true,
  keep_docstrings: true,
  omit_baselib: true,
  private_scope: false,
  write_name: false,
};

function write(filename, contents) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

function fixture(directory) {
  const main = join(directory, "main.py");
  write(main, "import package.module\nanswer = package.module.value\n");
  write(join(directory, "package", "__init__.py"), "kind = 'package'\n");
  write(join(directory, "package", "module.py"), "value = 42\n");
  return main;
}

async function compileFixture(
  directory,
  { cache, portable = true, precompiled, prefix = "src" } = {},
) {
  const main = fixture(directory);
  const portableSources = portable
    ? createPortableSourcePaths(directory, prefix)
    : undefined;
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(readFileSync(main, "utf8"), {
      filename: main,
      basedir: directory,
      exact_integer_literals: true,
      ...(portableSources
        ? {
            filename_policy: portableSources.policy,
            logicalize_filename: portableSources.logicalize,
          }
        : {}),
      module_cache_dir: cache,
      precompiled_module_cache_dir: precompiled,
      strict_python_scopes: true,
    });
    const output = new compiler.OutputStream({
      ...outputOptions,
      module_cache_dir: cache,
    });
    ast.print(output);
    return { ast, javascript: output.get(), main, portable: portableSources };
  } finally {
    frontend.close();
  }
}

test("portable source paths validate roots, prefixes, and symlink containment", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-portable-paths-"));
  const outside = mkdtempSync(join(tmpdir(), "sagejs-portable-outside-"));
  try {
    const source = join(temporary, "module.py");
    write(source, "value = 1\n");
    const portable = createPortableSourcePaths(temporary, "src");
    assert.equal(portable.logicalize(source), "src/module.py");
    assert.match(portable.policy, /portable-source-filenames\/v1:src$/);
    assert.throws(
      () => portable.logicalize(join(outside, "module.py")),
      /outside the portable source root/,
    );
    for (const prefix of [
      "",
      ".",
      "..",
      "/src",
      "C:\\src",
      "C:src",
      "src:bad",
      "src\0bad",
      "src//nested",
      "src/../lib",
      "src/.",
      "NUL",
      "NUL.txt",
      "nested/COM1.log",
      "nested/LPT9.py",
    ]) {
      assert.throws(
        () => createPortableSourcePaths(temporary, prefix),
        /prefix/,
      );
    }

    const linked = join(temporary, "linked");
    symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
    write(join(outside, "escaped.py"), "value = 2\n");
    assert.throws(
      () => portable.logicalize(join(linked, "escaped.py")),
      /outside the portable source root/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("null-policy precompiled caches relocate without retaining builder paths", async () => {
  const left = mkdtempSync(join(tmpdir(), "sagejs-precompiled-left-"));
  const right = mkdtempSync(join(tmpdir(), "sagejs-precompiled-right-"));
  const cache = join(left, "cache");
  const precompiled = join(right, "precompiled");
  mkdirSync(cache);
  mkdirSync(precompiled);
  try {
    const built = await compileFixture(join(left, "source"), {
      cache,
      portable: false,
    });
    const cacheName = readdirSync(cache).find((name) =>
      name.includes("source-package-module.py"),
    );
    assert.ok(cacheName);
    copyFileSync(
      join(cache, cacheName),
      join(precompiled, "package-module.json"),
    );

    const relocated = await compileFixture(join(right, "source"), {
      portable: false,
      precompiled,
    });
    const module = relocated.ast.imports["package.module"];
    assert.equal(module.is_cached, true);
    assert.equal(module.filename, join(right, "source", "package", "module.py"));
    assert.equal(module.source_filename, module.filename);
    assert.equal(relocated.javascript.includes(left), false);
    assert.equal(relocated.javascript.includes(right), true);
    assert.notEqual(built.main, relocated.main);
  } finally {
    rmSync(left, { recursive: true, force: true });
    rmSync(right, { recursive: true, force: true });
  }
});

test("logical module metadata retains physical cache authority", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-portable-cache-"));
  const cache = join(temporary, "cache");
  const source = join(temporary, "source");
  mkdirSync(cache);
  try {
    const first = await compileFixture(source, { cache });
    assert.equal(first.ast.filename, "src/main.py");
    assert.equal(first.ast.source_filename, first.main);
    assert.equal(first.ast.start.file, "src/main.py");
    assert.equal(first.ast.imports.package.filename, "src/package/__init__.py");
    assert.equal(
      first.ast.imports["package.module"].filename,
      "src/package/module.py",
    );
    assert.equal(
      first.ast.imports["package.module"].source_filename,
      join(source, "package", "module.py"),
    );
    assert.match(
      first.javascript,
      /__file__ = "src\/package\/module\.py"/,
    );
    assert.match(
      first.javascript,
      /__path__ = \["src\/package"\]/,
    );
    assert.match(
      first.javascript,
      /origin:"src\/package\/module\.py"/,
    );
    assert.equal(first.javascript.includes(source), false);

    const cacheNames = readdirSync(cache);
    assert.ok(cacheNames.length >= 1);
    assert.ok(cacheNames.some((name) => name.includes("source-package-module.py")));

    const second = await compileFixture(source, { cache });
    assert.equal(second.ast.imports["package.module"].is_cached, true);
    assert.equal(second.ast.imports["package.module"].filename, "src/package/module.py");

    const conflicting = await compileFixture(source, {
      cache,
      prefix: "alternate",
    });
    assert.equal(conflicting.ast.imports["package.module"].is_cached, undefined);
    assert.equal(
      conflicting.ast.imports["package.module"].filename,
      "alternate/package/module.py",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("portable compilation is byte-identical across physical roots", async () => {
  const left = mkdtempSync(join(tmpdir(), "sagejs-portable-left-"));
  const right = mkdtempSync(join(tmpdir(), "sagejs-portable-right-"));
  try {
    const leftBuild = await compileFixture(left);
    const rightBuild = await compileFixture(right);
    assert.equal(leftBuild.javascript, rightBuild.javascript);
    assert.equal(leftBuild.javascript.includes(left), false);
    assert.equal(rightBuild.javascript.includes(right), false);
  } finally {
    rmSync(left, { recursive: true, force: true });
    rmSync(right, { recursive: true, force: true });
  }
});

test("portable resolver rejects an outside main source and incomplete policy", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "sagejs-portable-root-"));
  const outside = mkdtempSync(join(tmpdir(), "sagejs-portable-main-"));
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const portable = createPortableSourcePaths(sourceRoot, "src");
    const filename = join(outside, "main.py");
    write(filename, "answer = 42\n");
    assert.throws(
      () => frontend.parse("answer = 42\n", {
        filename,
        basedir: outside,
        filename_policy: portable.policy,
        logicalize_filename: portable.logicalize,
      }),
      /outside the portable source root/,
    );
    assert.throws(
      () => frontend.parse("answer = 42\n", {
        filename,
        logicalize_filename: portable.logicalize,
      }),
      /must be configured together/,
    );

    const main = join(sourceRoot, "main.py");
    write(main, "import escaped\n");
    write(join(outside, "escaped.py"), "answer = 42\n");
    assert.throws(
      () => frontend.parse(readFileSync(main, "utf8"), {
        filename: main,
        basedir: sourceRoot,
        import_dirs: [outside],
        filename_policy: portable.policy,
        logicalize_filename: portable.logicalize,
      }),
      /outside the portable source root/,
    );
  } finally {
    frontend.close();
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("portable imported-module diagnostics retain physical filenames", async () => {
  const source = mkdtempSync(join(tmpdir(), "sagejs-portable-diagnostic-"));
  const main = join(source, "main.py");
  const bad = join(source, "bad.py");
  write(main, "import bad\n");
  write(bad, "from sagejs.runtime import reflect\n");
  const portable = createPortableSourcePaths(source);
  const frontend = await createPythonCompilerFrontend(createCompiler(), "python");
  try {
    assert.throws(
      () => frontend.parse(readFileSync(main, "utf8"), {
        filename: main,
        basedir: source,
        filename_policy: portable.policy,
        logicalize_filename: portable.logicalize,
      }),
      (error) => {
        assert.equal(error.filename, bad);
        assert.equal(error.fileName, bad);
        assert.equal(error.toString().includes(bad), true);
        return true;
      },
    );
  } finally {
    frontend.close();
    rmSync(source, { recursive: true, force: true });
  }
});

test("portable CLI stdin requires an explicit physical source identity", () => {
  const virtualSource = join(root, "src", ".portable-stdin.py");
  const common = [
    join(root, "bin", "sagejs"),
    "compile",
    "--python",
    "--omit-baselib",
    "--portable-sagejs-paths",
  ];
  const valid = spawnSync(
    process.execPath,
    [...common, "--filename-for-stdin", virtualSource],
    { cwd: root, encoding: "utf8", input: "answer = 42\n" },
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.includes(root), false);
  assert.match(valid.stdout, /src\/\.portable-stdin\.py/);

  const implicit = spawnSync(process.execPath, common, {
    cwd: root,
    encoding: "utf8",
    input: "answer = 42\n",
  });
  assert.notEqual(implicit.status, 0);
  assert.match(implicit.stderr, /requires an absolute physical path/);

  const outside = join(tmpdir(), ".portable-stdin.py");
  const escaped = spawnSync(
    process.execPath,
    [...common, "--filename-for-stdin", outside],
    { cwd: root, encoding: "utf8", input: "answer = 42\n" },
  );
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /outside the portable source root/);
});

test("portable CLI resolves ordinary relative source files", () => {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "compile",
      "--python",
      "--omit-baselib",
      "--portable-sagejs-paths",
      "src/compiler_version.py",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(root), false);
  assert.match(result.stdout, /src\/compiler_version\.py/);
});

test("built compiler and runtime assets contain no physical checkout root", () => {
  const artifacts = [
    "dist/compiler/compiler.js",
    "dist/compiler/baselib-plain-pretty.js",
    "dist/runtime-cache/runtime-bootstrap-sage.js",
    "dist/runtime-cache/runtime-bootstrap-sage.bin",
    "dist/runtime-cache/runtime-bootstrap-python.js",
    "dist/runtime-cache/runtime-bootstrap-python.bin",
  ];
  const spellings = new Set([
    root,
    root.replaceAll("\\", "/"),
    root.replaceAll("/", "\\"),
  ]);
  for (const spelling of [...spellings]) {
    spellings.add(JSON.stringify(spelling).slice(1, -1));
  }
  const needles = [...spellings].flatMap((spelling) => [
    Buffer.from(spelling, "utf8"),
    Buffer.from(spelling, "utf16le"),
  ]);
  for (const relativeFilename of artifacts) {
    const bytes = readFileSync(join(root, relativeFilename));
    for (const needle of needles) {
      assert.equal(
        bytes.indexOf(needle),
        -1,
        `${relativeFilename} embeds the physical checkout root`,
      );
    }
  }

  assert.match(
    readFileSync(join(root, "dist/compiler/compiler.js"), "utf8"),
    /__file__ = "src\/output\/modules\.py"/,
  );
  assert.match(
    readFileSync(join(root, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
    /__path__ = \["src\/baselib\/sagejs\/ffi"\]/,
  );
});
