"use strict";

const assert = require("node:assert/strict");
const {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");

const root = resolve(__dirname, "..");

async function testNodeHost() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-os-"));
  mkdirSync(join(sandbox, "sub"));
  writeFileSync(join(sandbox, "existing.txt"), "sagejs\n");

  const session = await createSage({ mode: "python" });
  try {
    const originalProcessCwd = process.cwd();
    const source = [
      "import os",
      "import os.path",
      "assert os.path is __import__('os.path', fromlist=['path'])",
      `sandbox = ${JSON.stringify(sandbox)}`,
      "print(os.name)",
      "print(repr(os.sep), repr(os.pathsep), repr(os.linesep))",
      "os.chdir(sandbox)",
      "print(os.path.basename(os.getcwd()) == os.path.basename(sandbox) and os.path.isdir(os.getcwd()))",
      "print(sorted(os.listdir('.')))",
      "print(sorted(entry.name for entry in os.scandir('.')))",
      "metadata = os.stat('existing.txt')",
      "print(metadata.st_size, len(metadata), os.path.isfile('existing.txt'), os.path.isdir('sub'))",
      "print(os.path.basename(os.path.join('a', 'b.txt')), os.path.splitext('b.tar.gz'))",
      "print(os.path.normpath(os.path.join('a', '..', 'b')))",
      "os.mkdir('fresh')",
      "os.makedirs(os.path.join('tree', 'leaf'))",
      "print(os.path.isdir('fresh'), os.path.isdir(os.path.join('tree', 'leaf')))",
      "os.rename('existing.txt', 'renamed.txt')",
      "print(os.path.exists('renamed.txt'), os.access('renamed.txt', os.R_OK))",
      "os.environ['SAGEJS_OS_TEST'] = 'works'",
      "print(os.getenv('SAGEJS_OS_TEST'), 'SAGEJS_OS_TEST' in os.environ)",
      "del os.environ['SAGEJS_OS_TEST']",
      "print(os.getenv('SAGEJS_OS_TEST') is None)",
      "print(os.cpu_count() > 0, os.getpid() > 0, len(os.urandom(13)))",
      "descriptor_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_BINARY",
      "descriptor = os.open('exclusive.bin', descriptor_flags, 0o600)",
      "print(os.write(descriptor, b'descriptor-data'))",
      "os.fsync(descriptor)",
      "os.close(descriptor)",
      "try:",
      "    os.open('exclusive.bin', descriptor_flags, 0o600)",
      "except FileExistsError as error:",
      "    print(type(error).__name__, error.errno)",
      "if os.name != 'nt':",
      "    writeFile = open('descriptor-victim.txt', 'w')",
      "    writeFile.write('victim-data')",
      "    writeFile.close()",
      "    descriptor = os.open('detached.tmp', descriptor_flags, 0o600)",
      "    os.unlink('detached.tmp')",
      "    os.symlink('descriptor-victim.txt', 'detached.tmp')",
      "    print(os.write(descriptor, b'unlinked-data'))",
      "    os.fsync(descriptor)",
      "    os.close(descriptor)",
      "    victim = open('descriptor-victim.txt', 'r')",
      "    print(victim.read())",
      "    victim.close()",
      "    directory_descriptor = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)",
      "    os.fsync(directory_descriptor)",
      "    os.close(directory_descriptor)",
      "try:",
      "    os.stat('missing')",
      "except FileNotFoundError as error:",
      "    print(type(error).__name__, error.errno, os.path.basename(error.filename))",
      "os.remove('renamed.txt')",
      "os.rmdir('fresh')",
      "os.rmdir(os.path.join('tree', 'leaf'))",
      "os.rmdir('tree')",
      "print(os.path.exists('renamed.txt'))",
    ].join("\n");

    const result = await session.evaluate(source);
    const platformLine =
      process.platform === "win32"
        ? "nt\n'\\\\' ';' '\\r\\n'"
        : "posix\n'/' ':' '\\n'";
    assert.equal(
      result.stdout.trim(),
      [
        platformLine,
        "True",
        "['existing.txt', 'sub']",
        "['existing.txt', 'sub']",
        "7 10 True True",
        "b.txt ('b.tar', '.gz')",
        process.platform === "win32" ? "b" : "b",
        "True True",
        "True True",
        "works True",
        "True",
        "True True 13",
        "15",
        "FileExistsError 17",
        ...(process.platform === "win32" ? [] : ["13", "victim-data"]),
        "FileNotFoundError 2 missing",
        "False",
      ].join("\n"),
    );
    if (process.platform !== "win32") {
      assert.equal(statSync(join(sandbox, "exclusive.bin")).mode & 0o777, 0o600);
      assert.equal(lstatSync(join(sandbox, "detached.tmp")).isSymbolicLink(), true);
    }
    assert.equal(process.cwd(), originalProcessCwd, "os.chdir must remain session-local");
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
}

async function testPathCompatibilityAndUnavailableHost() {
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  try {
    evaluator.evaluate(
      [
        "import posixpath",
        "import ntpath",
        "print(posixpath.normpath('//a//b/../c'))",
        "print(posixpath.join('/a', 'b', '/c', 'd'))",
        "print(posixpath.splitext('/a/.profile'))",
        "print(posixpath.relpath('/a/b/c', '/a/d'))",
        "print(ntpath.normpath('C:/a/../b'))",
        "print(ntpath.join('C:\\\\a', 'b', '\\\\c'))",
        "print(ntpath.splitdrive('\\\\\\\\server\\\\share\\\\a'))",
        "print(ntpath.splitext('C:\\\\a\\\\file.tar.gz'))",
        "print(ntpath.relpath('C:\\\\a\\\\b', 'C:\\\\a\\\\c'))",
      ].join("\n"),
    );
    assert.equal(
      output.join("").trim(),
      [
        "//a/c",
        "/c/d",
        "('/a/.profile', '')",
        "../b/c",
        "C:\\b",
        "C:\\c",
        "('\\\\\\\\server\\\\share', '\\\\a')",
        "('C:\\\\a\\\\file.tar', '.gz')",
        "..\\b",
      ].join("\n"),
      "path results are derived from CPython 3.15 path semantics",
    );

    Reflect.deleteProperty(globalThis, "__sagejs_host__");
    output.length = 0;
    evaluator.evaluate(
      [
        "import os",
        "print(os.path.normpath('/a/../b'))",
        "try:",
        "    os.listdir('.')",
        "except NotImplementedError as error:",
        "    print('unavailable' in str(error))",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "/b\nTrue");
  } finally {
    evaluator.close();
  }
}

async function main() {
  await testNodeHost();
  await testPathCompatibilityAndUnavailableHost();
  console.log("Sage.js os/path host compatibility passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
