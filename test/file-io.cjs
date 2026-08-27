// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");

async function testNodeFiles() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-open-"));
  writeFileSync(join(sandbox, "input.txt"), "alpha\r\nbeta\r\n", "utf8");
  writeFileSync(join(sandbox, "input.bin"), Buffer.from([0, 1, 10, 255]));
  writeFileSync(join(sandbox, "mixed.txt"), "a\r\nb\rc\n", "utf8");
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
        "with open('mixed.txt', newline=None) as mixed:",
        "    print(tuple(mixed), repr(mixed.newlines))",
        "with open('mixed.txt', newline='') as mixed:",
        "    print(tuple(mixed), repr(mixed.newlines))",
        "with open('mixed.txt', newline='\\r') as mixed:",
        "    print(tuple(mixed), repr(mixed.newlines))",
        "buffered = open('buffered.txt', 'w')",
        "buffered.write('pending')",
        "print(repr(open('buffered.txt').read()))",
        "buffered.flush()",
        "print(open('buffered.txt').read())",
        "buffered.close()",
        "line_buffered = open('line-buffered.txt', 'w', buffering=1)",
        "line_buffered.write('first')",
        "print(repr(open('line-buffered.txt').read()))",
        "line_buffered.write('\\nsecond')",
        "print(repr(open('line-buffered.txt').read()), line_buffered.line_buffering)",
        "line_buffered.close()",
        "raw = open('raw.bin', 'wb', buffering=0)",
        "raw.write(b'now')",
        "print(open('raw.bin', 'rb').read(), raw.write_through)",
        "raw.close()",
        "binary = open('input.bin', 'rb')",
        "target = bytearray(3)",
        "print(binary.readinto(target), list(target), binary.isatty(), binary.seekable())",
        "try:",
        "    open('input.txt').seek(1, 1)",
        "except OSError as error:",
        "    print(type(error).__name__, str(error))",
        "memory_text = io.StringIO('a\\nb')",
        "memory_bytes = io.BytesIO(b'a\\nb')",
        "print(memory_text.readable(), memory_text.writable(), memory_text.seekable(), memory_text.isatty(), memory_text.readlines())",
        "print(memory_bytes.readable(), memory_bytes.writable(), memory_bytes.seekable(), memory_bytes.isatty(), memory_bytes.readlines())",
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
        "('a\\n', 'b\\n', 'c\\n') ('\\r', '\\n', '\\r\\n')",
        "('a\\r\\n', 'b\\r', 'c\\n') ('\\r', '\\n', '\\r\\n')",
        "('a\\r', '\\nb\\r', 'c\\n') None",
        "''",
        "pending",
        "''",
        "'first\\nsecond' True",
        "b'now' True",
        "3 [0, 1, 10] False True",
        "OSError can't do nonzero cur-relative seeks",
        "True True True False ['a\\n', 'b']",
        "True True True False [b'a\\n', b'b']",
      ].join("\n"),
    );
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
}

async function testUnavailableHost() {
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
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
