"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluator,
} = require("../dist/tools/kernel-evaluator.js");

async function testNodeFiles() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-open-"));
  writeFileSync(join(sandbox, "input.txt"), "alpha\r\nbeta\r\n", "utf8");
  writeFileSync(join(sandbox, "input.bin"), Buffer.from([0, 1, 10, 255]));
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import os",
        "import builtins",
        "import io",
        `os.chdir(${JSON.stringify(sandbox)})`,
        "print(builtins.open is open, io.open is open)",
        "print([line.strip() for line in open('input.txt')])",
        "source = open('input.txt')",
        "print(source.read(5), source.tell())",
        "print(repr(source.readline()))",
        "source.seek(0)",
        "print(source.readlines())",
        "source.close()",
        "print(source.closed)",
        "try:",
        "    source.read()",
        "except ValueError as error:",
        "    print(type(error).__name__, str(error))",
        "with open('output.txt', 'w') as output:",
        "    print(output.write('one\\ntwo\\n'))",
        "print(output.closed, open('output.txt').read())",
        "with open('output.txt', 'a') as output:",
        "    output.write('three\\n')",
        "with open('output.txt', 'r+') as output:",
        "    output.seek(0)",
        "    output.write('ONE')",
        "print(open('output.txt').read())",
        "print(open('input.bin', 'rb').read())",
        "with open('output.bin', 'wb') as output:",
        "    print(output.write(bytes([2, 3, 254])))",
        "print(open('output.bin', 'rb').read())",
        "try:",
        "    open('output.txt', 'x')",
        "except FileExistsError as error:",
        "    print(type(error).__name__, error.errno, os.path.basename(error.filename))",
        "try:",
        "    open('missing.txt')",
        "except FileNotFoundError as error:",
        "    print(type(error).__name__, error.errno, os.path.basename(error.filename))",
        "class LocalPath:",
        "    def __fspath__(self):",
        "        return 'input.txt'",
        "print(open(LocalPath()).readline().strip())",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "True True",
        "['alpha', 'beta']",
        "alpha 5",
        "'\\n'",
        "['alpha\\n', 'beta\\n']",
        "True",
        "ValueError I/O operation on closed file",
        "8",
        "True one",
        "two",
        "",
        "ONE",
        "two",
        "three",
        "",
        "b'\\x00\\x01\\n\\xff'",
        "3",
        "b'\\x02\\x03\\xfe'",
        "FileExistsError 17 output.txt",
        "FileNotFoundError 2 missing.txt",
        "alpha",
      ].join("\n"),
    );
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function testUnavailableHost() {
  const output = [];
  const evaluator = createKernelEvaluator({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  Reflect.deleteProperty(globalThis, "__sagejs_host__");
  try {
    evaluator.evaluate(
      [
        "try:",
        "    open('unavailable.txt').read()",
        "except NotImplementedError as error:",
        "    print('host filesystem capability' in str(error))",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "True");
  } finally {
    evaluator.close();
  }
}

testNodeFiles()
  .then(testUnavailableHost)
  .then(() => console.log("Sage.js built-in file I/O passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
