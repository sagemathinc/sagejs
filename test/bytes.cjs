"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const referencePython = process.env.SAGEJS_REFERENCE_PYTHON ||
  process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

function execute(command, args, source) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, "");
  return result.stdout;
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
  const cpython = execute(referencePython, ["-"], differentialSource);
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
