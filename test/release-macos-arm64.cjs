"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { performance } = require("node:perf_hooks");

const root = join(__dirname, "..");
const archive = process.env.SAGEJS_RELEASE_MACOS_ARCHIVE;
const expectedSignature = process.env.SAGEJS_RELEASE_MACOS_SIGNATURE;
const sourceRoot = process.env.SAGEJS_RELEASE_SOURCE_ROOT;

function execute(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: 90_000,
    ...options,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || `${command} terminated by ${result.signal}`,
  );
  return result;
}

function signatureDetails(executable) {
  const result = spawnSync("codesign", ["--display", "--verbose=4", executable], {
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return `${result.stdout}\n${result.stderr}`;
}

function loadCommandRpaths(output) {
  const lines = output.split("\n");
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "cmd LC_RPATH") continue;
    for (index += 1; index < lines.length; index += 1) {
      const match = lines[index].trim().match(/^path\s+(.+?)\s+\(offset/);
      if (match) {
        rpaths.push(match[1]);
        break;
      }
      if (lines[index].startsWith("Load command")) break;
    }
  }
  return rpaths;
}

function isolatedEnvironment(root) {
  const environment = {};
  for (const name of ["LANG", "LC_ALL", "LC_CTYPE", "TZ"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return {
    ...environment,
    HOME: join(root, "home"),
    USERPROFILE: join(root, "home"),
    XDG_CACHE_HOME: join(root, "cache"),
    SAGEJS_NATIVE_CACHE_DIR: join(root, "cache", "native"),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    TMP: join(root, "tmp"),
    TEMP: join(root, "tmp"),
    TMPDIR: join(root, "tmp"),
  };
}

test(
  "the macOS release command documents credential-free candidates",
  { skip: !existsSync(join(root, "scripts", "release-macos.sh")) },
  () => {
    const result = execute("bash", [
      join(root, "scripts", "release-macos.sh"),
      "--help",
    ]);
    assert.match(result.stdout, /--unsigned/);
    assert.match(result.stdout, /no Developer ID signature/);
    assert.match(result.stdout, /not publishable/);
  },
);

test("the macOS candidate witness scrubs ambient runtime policy", () => {
  const before = {
    dyld: process.env.DYLD_LIBRARY_PATH,
    node: process.env.NODE_OPTIONS,
    sagejs: process.env.SAGEJS_USE_SOURCE,
  };
  process.env.DYLD_LIBRARY_PATH = "/outside/injection";
  process.env.NODE_OPTIONS = "--require=/outside/injection.cjs";
  process.env.SAGEJS_USE_SOURCE = "1";
  try {
    const environment = isolatedEnvironment("/fixture/release-root");
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.NODE_PATH, undefined);
    assert.equal(environment.SAGEJS_USE_SOURCE, undefined);
    assert.equal(environment.SAGEJS_NATIVE_MODE, undefined);
    assert.equal(environment.DYLD_LIBRARY_PATH, undefined);
    assert.equal(environment.PATH, "/usr/bin:/bin:/usr/sbin:/sbin");
    assert.match(environment.SAGEJS_NATIVE_CACHE_DIR, /cache[\\/]native$/);
  } finally {
    if (before.dyld === undefined) delete process.env.DYLD_LIBRARY_PATH;
    else process.env.DYLD_LIBRARY_PATH = before.dyld;
    if (before.node === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = before.node;
    if (before.sagejs === undefined) delete process.env.SAGEJS_USE_SOURCE;
    else process.env.SAGEJS_USE_SOURCE = before.sagejs;
  }
});

test(
  "the extracted macOS arm64 candidate is self-contained and mathematically sound",
  {
    skip:
      process.platform !== "darwin" ||
      process.arch !== "arm64" ||
      !archive ||
      !expectedSignature,
  },
  () => {
    assert.equal(existsSync(archive), true, `release archive is absent: ${archive}`);
    assert.equal(expectedSignature === "adhoc" || expectedSignature === "developer-id", true);

    const temporary = mkdtempSync(join(tmpdir(), "sagejs-macos-release-"));
    try {
      const extraction = join(temporary, "extracted");
      const home = join(temporary, "home");
      const cache = join(temporary, "cache");
      const scratch = join(temporary, "tmp");
      const work = join(temporary, "work");
      mkdirSync(extraction);
      mkdirSync(home);
      mkdirSync(cache);
      mkdirSync(scratch);
      mkdirSync(work);
      execute("ditto", ["-x", "-k", archive, extraction]);

      const entries = readdirSync(extraction);
      assert.deepEqual(entries, [basename(archive, ".zip")]);
      const distribution = join(extraction, entries[0]);
      const sagejs = join(distribution, "sagejs");
      const sagepython = join(distribution, "sagepython");
      for (const executable of [sagejs, sagepython]) {
        const status = statSync(executable);
        assert.equal(status.isFile(), true);
        assert.notEqual(
          status.mode & 0o111,
          0,
          `archive extraction lost executable mode bits: ${executable}`,
        );
        const architectures = execute("lipo", ["-archs", executable]).stdout;
        assert.match(architectures, /^arm64\s*$/);
        execute("codesign", ["--verify", "--deep", "--strict", executable]);
        const details = signatureDetails(executable);
        if (expectedSignature === "adhoc") {
          assert.match(details, /Signature=adhoc/);
          assert.match(details, /TeamIdentifier=not set/);
          assert.doesNotMatch(details, /Authority=Developer ID Application/);
        } else {
          assert.match(details, /Authority=Developer ID Application/);
          assert.doesNotMatch(details, /Signature=adhoc/);
        }
        const libraries = execute("otool", ["-L", executable]).stdout;
        if (sourceRoot) {
          assert.equal(libraries.includes(resolve(sourceRoot)), false);
        }
        const nonSystem = libraries
          .split("\n")
          .slice(1)
          .map((line) => line.trim().split(/\s+/)[0])
          .filter(Boolean)
          .filter(
            (library) =>
              !library.startsWith("/usr/lib/") &&
              !library.startsWith("/System/Library/"),
          );
        assert.deepEqual(
          nonSystem,
          [],
          `release executable has unbound or non-system dependencies: ${nonSystem.join(", ")}`,
        );
        const unsafeRpaths = loadCommandRpaths(
          execute("otool", ["-l", executable]).stdout,
        ).filter(
          (path) =>
            !path.startsWith("/usr/lib/") &&
            !path.startsWith("/System/Library/"),
        );
        assert.deepEqual(
          unsafeRpaths,
          [],
          `release executable has non-system LC_RPATH entries: ${unsafeRpaths.join(", ")}`,
        );
      }

      for (const filename of ["LICENSE", "README.md", "DISTRIBUTION.md", "licenses"]) {
        assert.equal(existsSync(join(distribution, filename)), true, `${filename} is absent`);
      }

      const environment = isolatedEnvironment(temporary);

      const pythonStarted = performance.now();
      const python = execute(sagepython, ["--jupyter-kernel-self-test"], {
        cwd: work,
        env: environment,
      });
      const pythonMilliseconds = performance.now() - pythonStarted;
      assert.equal(python.stdout.trim(), "Sage.js Jupyter SEA runtime passed.");

      const program = join(work, "exact-release-smoke.sage");
      writeFileSync(
        program,
        [
          "A = matrix(QQ, [[1/2, 2/3], [3/5, 5/7]])",
          "assert A.det() == -3/70",
          "assert (A*A).det() == 9/4900",
          "B = matrix(ZZ, [[2, 3], [5, 7]])",
          "assert B.det() == -1",
          "F = GF(97)",
          "C = matrix(F, [[1, 2], [3, 5]])",
          "assert C.rank() == 2",
          "assert C.det() == F(96)",
          "assert str(factor(2026)) == '2 * 1013'",
          "print('sagejs macos arm64 release candidate ok')",
          "",
        ].join("\n"),
      );
      const coldStarted = performance.now();
      const cold = execute(sagejs, [program], { cwd: work, env: environment });
      const coldMilliseconds = performance.now() - coldStarted;
      assert.equal(cold.stdout.trim(), "sagejs macos arm64 release candidate ok");

      const warmStarted = performance.now();
      const warm = execute(sagejs, [program], { cwd: work, env: environment });
      const warmMilliseconds = performance.now() - warmStarted;
      assert.equal(warm.stdout.trim(), "sagejs macos arm64 release candidate ok");

      const authoritative = execute(
        process.execPath,
        [
          join(root, "scripts", "release-math-smoke.cjs"),
          "--executable",
          sagejs,
          "--require-native",
          "--max-seconds",
          "60",
        ],
        { cwd: work, env: environment },
      );
      assert.match(authoritative.stdout, /Release mathematics smoke passed:/);

      assert.ok(pythonMilliseconds < 60_000);
      assert.ok(coldMilliseconds < 60_000);
      assert.ok(warmMilliseconds < 60_000);
      console.log(
        `macOS candidate clean-home timings: python=${pythonMilliseconds.toFixed(1)}ms ` +
          `cold=${coldMilliseconds.toFixed(1)}ms warm=${warmMilliseconds.toFixed(1)}ms`,
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
