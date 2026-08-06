"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { zipSync, strToU8 } = require("fflate");

const { runPackageCli } = require("../dist/tools/python-packages.js");

function child(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (data) => stdout += data);
    process.stderr.on("data", (data) => stderr += data);
    process.on("error", reject);
    process.on("close", (status) => resolve({ status, stdout, stderr }));
    if (options.input) process.stdin.end(options.input);
  });
}

test("pure wheel installation feeds the default Sage.js import path", async (t) => {
  const wheelName = "sagejs_demo-1.0-py3-none-any.whl";
  const wheel = zipSync({
    "sagejs_demo/__init__.py": strToU8(
      "value = 42\n\ndef greet(name):\n    return 'hello ' + name\n",
    ),
    "sagejs_demo-1.0.dist-info/METADATA": strToU8(
      "Metadata-Version: 2.1\nName: sagejs-demo\nVersion: 1.0\n",
    ),
    "sagejs_demo-1.0.dist-info/WHEEL": strToU8(
      "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    ),
  });
  const digest = createHash("sha256").update(wheel).digest("hex");
  const server = createServer((request, response) => {
    if (request.url === "/pypi/sagejs-demo/1.0/json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        info: { name: "sagejs-demo", version: "1.0", requires_dist: [] },
        urls: [{
          filename: wheelName,
          packagetype: "bdist_wheel",
          url: `http://127.0.0.1:${server.address().port}/${wheelName}`,
          digests: { sha256: digest },
        }],
      }));
      return;
    }
    if (request.url === `/${wheelName}`) {
      response.end(wheel);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const target = mkdtempSync(join(tmpdir(), "sagejs-packages-"));
  await runPackageCli({
    files: ["install", "sagejs-demo==1.0"],
    target,
    index_url: `http://127.0.0.1:${server.address().port}/pypi`,
  });
  assert.match(
    readFileSync(join(target, "sagejs_demo", "__init__.py"), "utf8"),
    /value = 42/,
  );

  const result = await child(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs-source.cjs"), "--python"],
    {
      env: { ...process.env, SAGEJS_SITE_PACKAGES: target },
      input: "import sagejs_demo\nprint(sagejs_demo.greet('world'))\n",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "hello world");
});

test("package-facing Python introspection and scope semantics", async () => {
  const source = [
    "import traceback",
    "import types",
    "class Example:",
    "    pass",
    "def identity(value):",
    "    return value",
    "assert isinstance(identity, types.FunctionType)",
    "assert not isinstance(Example, types.FunctionType)",
    "assert isinstance(Example, type)",
    "assert identity.__doc__ is None",
    "assert identity.__annotations__ == {}",
    "assert identity.__kwdefaults__ is None",
    "values = [item for item in range(3)]",
    "assert values == [0, 1, 2]",
    "assert 'item' not in globals()",
    "assert 'a\\tb'.expandtabs(4) == 'a   b'",
    "try:",
    "    identity(1, 2)",
    "except TypeError as error:",
    "    assert error.__traceback__ is not None",
    "    assert error.with_traceback(None) is error",
    "else:",
    "    raise AssertionError('argument binding must fail')",
    "print('compatible')",
    "",
  ].join("\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-package-semantics-"));
  const program = join(directory, "check.py");
  writeFileSync(program, source);
  const result = await child(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs-source.cjs"), program],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "compatible");
});
