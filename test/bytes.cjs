// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { resolve } = require("node:path");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");

function execute(command, args, source) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, "");
  return result.stdout.replaceAll("\r\n", "\n");
}

const differentialSource = String.raw`
cases = [
    (b"", "strict"),
    (b"plain ASCII\x00\x7f", "strict"),
    (b"A\x80B\xffC", "strict"),
    (b"A\x80B\xffC", "ignore"),
    (b"A\x80B\xffC", "replace"),
    (b"valid", "not-a-handler"),
    (b"\x80", "not-a-handler"),
]
for source, errors in cases:
    try:
        print("ok", repr(source.decode("ascii", errors)))
    except Exception as error:
        if isinstance(error, UnicodeDecodeError):
            print(
                "decode-error",
                error.args[0],
                repr(bytes(error.args[1])),
                error.args[2],
                error.args[3],
                error.args[4],
            )
        else:
            print("error", type(error).__name__, str(error))
for source in (bytes(b"byte source"), bytearray(b"bytearray source")):
    print("kind", repr(source.decode("us-ascii")))
`;

test("ASCII decode agrees with CPython", () => {
  const cpython = execute(
    pythonExecutable(),
    ["-X", "utf8", "-"],
    differentialSource,
  );
  const sagejs = execute(
    process.execPath,
    [resolve(root, "bin", "sagejs"), "--python"],
    differentialSource,
  );
  assert.equal(sagejs.trim(), cpython.trim());
});

test("large ASCII byte strings use the bulk path", () => {
  const output = execute(
    process.execPath,
    [resolve(root, "bin", "sagejs"), "--python"],
    String.raw`
source = b"A" * (2**20)
assert source.decode("ascii") == "A" * len(source)
assert bytearray(source).decode("ascii") == "A" * len(source)
print("fast-ascii-large-ok")
`,
  );
  assert.equal(output.trim(), "fast-ascii-large-ok");
});

const punycodeSource = String.raw`
for value in (b"x", b"\xff", b"", b"ab", bytearray(b"x"), bytearray(b"\xff"), bytearray(b""), bytearray(b"ab")):
    try:
        print("byte-ordinal", type(value).__name__, repr(value), ord(value))
    except TypeError as error:
        print("byte-ordinal-error", type(value).__name__, repr(value), str(error))
for text in ("\ud800", "\udfff", "\U0001f600", "\ud800A", "ab", ""):
    try:
        print("ordinal", [ord(c) for c in text], ord(text))
    except TypeError:
        print("ordinal-type-error", len(text))
for kind, obj in ((UnicodeDecodeError, b"x"), (UnicodeEncodeError, "x")):
    for count in (0, 1, 4, 6):
        try:
            kind(*([None] * count))
        except TypeError as error:
            print("unicode-arity", kind.__name__, count, str(error))
        else:
            raise AssertionError("invalid codec exception arity was accepted")
    error = kind("codec", obj, 0, 1, "reason")
    print("unicode-fields", error.encoding, error.object == obj, error.start, error.end, error.reason)
    error.start = 2
    print("unicode-fields-mutated", error.start, error.args[2])
texts = [
    "", "abc", "plain ASCII\x00\x7f", "bücher", "BÜCHER", "mañana",
    "例え", "☃", "\U0001f600", "a\U0001f600b", "\ud800", "\udfff",
    "\U0010ffff", "ééé", "e\u0301", "é", "a-b", "xn--bcher-kva.de",
    "\U0001f600\uffff\U0001f600", "\U0010ffffa\u0301\U0001f600",
]
for index, source in enumerate(texts):
    for errors in ("strict", "ignore", "replace", "not-a-handler"):
        encoded = source.encode("punycode", errors)
        print("encode", index, errors, repr(encoded))
        print("construct", index, errors, repr(bytes(source, "punycode", errors)))
        # Code points keep lone surrogates off the host's UTF-8 stdout boundary.
        print("roundtrip", index, [ord(c) for c in encoded.decode("punycode")])

inputs = [
    b"", b"-", b"abc-", b"a-b-", b"bcher-kva", b"BCHER-2PA", b"abc",
    b"e28h", b"ib9b", b"plain\x00\x7f-", b"%", b"\xff", b"abc-\xff",
    b"abc-%", b"z", b"abc-z", b"bcher-kva%", b"\xff-", b"a\xff-b",
    b"zzzzzzzzzz", b"999999a", b"9" * 80,
]
for index, source in enumerate(inputs):
    for errors in ("strict", "ignore", "replace", "not-a-handler"):
        for kind in (bytes, bytearray):
            try:
                decoded = kind(source).decode("punycode", errors)
                print("decode", index, errors, kind.__name__, [ord(c) for c in decoded])
            except Exception as error:
                if isinstance(error, UnicodeDecodeError):
                    print(
                        "decode-error", index, errors, kind.__name__,
                        error.args[0], repr(bytes(error.args[1])),
                        error.args[2], error.args[3], error.args[4],
                    )
                else:
                    print("error", index, errors, kind.__name__, type(error).__name__, str(error))
`;

test("raw Punycode codec and error handling agree with CPython without stderr", () => {
  const cpython = execute(
    pythonExecutable(),
    ["-X", "utf8", "-"],
    punycodeSource,
  );
  // Execute a Python file, not the piped interactive display hook.
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-punycode-test-"));
  try {
    const filename = resolve(directory, "codec.py");
    writeFileSync(filename, punycodeSource);
    const sagejs = execute(
      process.execPath,
      [resolve(root, "bin", "sagejs"), "--python", filename],
      "",
    );
    assert.equal(sagejs, cpython);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
