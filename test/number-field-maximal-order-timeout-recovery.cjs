"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PersistentLineProcess } = require(
  "../tools/number-field-maximal-order/process.cjs"
);

const worker = String.raw`
  "use strict";
  const readline = require("node:readline");
  process.stdout.write("@@NFMO_READY@@synthetic worker\n");
  const input = readline.createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (line === "timeout") return;
    process.stdout.write("@@NFMO_RESULT@@" + line + "\n");
  });
`;

test("a bounded timeout is fully reaped before the replacement worker starts", async () => {
  const process = new PersistentLineProcess({
    name: "synthetic-timeout-worker",
    command: global.process.execPath,
    args: ["-e", worker],
    cwd: __dirname,
    startupTimeoutMs: 2_000,
  });
  try {
    const timedOut = await process.request("timeout", { timeoutMs: 20 });
    assert.equal(timedOut.status, "timeout");

    // This request starts a replacement immediately.  The process manager
    // must internally wait for the killed process group to finish exiting.
    const recovered = await process.request("recovered", { timeoutMs: 2_000 });
    assert.equal(recovered.status, "ok");
    assert.equal(recovered.line, "recovered");
  } finally {
    process.close();
  }
});
