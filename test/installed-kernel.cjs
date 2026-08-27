// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");

const {
  SageSession,
  SageSessionClosedError,
} = require("../tools/installed-kernel.cjs");
const { SAGEJS_VERSION_INFO } = require("../dist/tools/version-info.js");

test("installed kernel protocol provides a persistent native session", async (t) => {
  const session = new SageSession({
    executable: process.execPath,
    kernelArguments: [join(__dirname, "..", "dist", "tools", "sea-entry.js")],
  });
  t.after(() => session.close());

  await session.ready();
  const output = [];
  const first = await session.evaluate("a = 2026\nprint(sum([1..100]))\na");
  assert.equal(first.repr, "2026");
  assert.equal(first.stdout, "5050\n");
  const second = await session.evaluate("a * 2", {
    onOutput: (text) => output.push(text),
  });
  assert.equal(second.repr, "4052");
  assert.deepEqual(output, []);
  assert.equal((await session.isComplete("2 + 2")).status, "complete");
  assert.ok((await session.documentation()).entries.length > 20);
  assert.equal(
    (await session.evaluate("version()")).repr,
    JSON.stringify(
      `Sage.js v${SAGEJS_VERSION_INFO.version} ` +
        `[${SAGEJS_VERSION_INFO.platform}], Release Date: ` +
        SAGEJS_VERSION_INFO.release_date,
    ).replaceAll('"', "'"),
  );
  assert.equal(
    (await session.evaluate("version(True) == version(json=True)")).repr,
    "True",
  );
  const machineVersion = await session.evaluate(
    '(version(True)["schema"], version(True)["version"], ' +
      'version(True)["release_date"], version(True)["platform"])',
  );
  assert.equal(
    machineVersion.repr,
    `('sagejs.version/v1', '${SAGEJS_VERSION_INFO.version}', ` +
      `'${SAGEJS_VERSION_INFO.release_date}', ` +
      `'${SAGEJS_VERSION_INFO.platform}')`,
  );

  await session.close();
  await assert.rejects(session.evaluate("1 + 1"), SageSessionClosedError);
});

test("version is a Sage-mode convenience and does not alter Python builtins", async (t) => {
  const session = new SageSession({
    executable: process.execPath,
    kernelArguments: [
      join(__dirname, "..", "dist", "tools", "sea-entry.js"),
      "--python",
    ],
  });
  t.after(() => session.close());
  await session.ready();
  await assert.rejects(session.evaluate("version()"), /name 'version' is not defined/);
});
