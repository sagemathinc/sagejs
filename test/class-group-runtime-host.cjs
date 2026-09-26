// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  NodeClassGroupBackend,
  installNodeHost,
} = require("../dist/tools/host.js");

function fakeService(directory, corrupt = false, wrongId = false, declined = false, badCore = false) {
  const fixtureName = corrupt ? "corrupt" : wrongId ? "wrong-id" : declined ? "declined" :
    badCore ? "bad-core" : "normal";
  const filename = path.join(directory, fixtureName + "-service");
  const startup = path.join(directory, fixtureName + "-started");
  const source = `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const readline = require("node:readline");
fs.writeFileSync(${JSON.stringify(startup)}, String(process.pid));
const generation = String(process.pid);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (input) => {
  let request;
  try { request = JSON.parse(input); }
  catch { return; }
  if (${JSON.stringify(corrupt)}) {
    process.stdout.write(JSON.stringify({ schema: "wrong", abi: 1, id: request.id, ok: true, result: {} }) + "\\n");
    return;
  }
  if (request.operation === "imaginary-class-group" && ${JSON.stringify(wrongId)}) {
    process.stdout.write(JSON.stringify({ schema: "sagejs.class-groups/service-response-v1", abi: 1,
      id: "wrong-host-id", ok: true, result: {} }) + "\\n");
    return;
  }
  if (request.operation === "imaginary-class-group" && ${JSON.stringify(declined)}) {
    process.stdout.write(JSON.stringify({ schema: "sagejs.class-groups/service-response-v1", abi: 1,
      id: request.id, ok: false, error: { schema: "sagejs.class-groups/service-response-v1",
      outcome: "error", category: "capability-declined", operation: request.operation,
      message: "fixture packed decline" } }) + "\\n");
    return;
  }
  let result;
  if (request.operation === "open") {
    result = { generation, handle: "1", completion: { outcome: "complete-conditional-grh" }, servicePid: process.pid };
  } else if (request.operation === "imaginary-class-number") {
    result = { schema: "sagejs.class-groups/service-response-v1", outcome: "complete",
      operation: request.operation, result: { discriminant: -23, classNumber: 3,
        proofStatus: "unconditional-complete" }, servicePid: process.pid };
  } else if (request.operation === "imaginary-class-group") {
    const form = { a: 1, b: 1, c: 1 };
    result = { schema: "sagejs.class-groups/service-response-v1", outcome: "complete",
      operation: request.operation, result: { discriminant: -3, classNumber: 1, invariantFactors: [],
        completeClassMap: [{ form, inverseForm: form, coordinates: [],
          representativeIdeal: { norm: 1, basisColumns: [[1, 0], [-1, 1]] } }],
        certificate: { discriminant: -3, reducedForms: [form] } },
      servicePid: process.pid };
    if (request.transport === "core-v2") {
      result.result.completeClassMapCorePacked = ${JSON.stringify(badCore)} ? [0, 1] : [1, 1];
      result.result.completeClassMapLength = 1;
      delete result.result.completeClassMap;
      result.result.certificate.reducedFormsPacked = [1, 1, 1];
      delete result.result.certificate.reducedForms;
    }
  } else if (request.generation !== generation || request.handle !== "1") {
    process.stdout.write(JSON.stringify({ schema: "sagejs.class-groups/service-response-v1", abi: 1, id: request.id, ok: false, error: { schema: "sagejs.class-groups/service-response-v1", outcome: "error", category: "stale-handle", operation: request.operation, message: "stale fixture handle" } }) + "\\n");
    return;
  } else if (request.operation === "publication") {
    result = { schema: "fixture-publication-v1", servicePid: process.pid };
  } else if (request.operation === "summary") {
    result = { schema: "fixture-summary-v1", servicePid: process.pid };
  } else if (request.operation === "query") {
    result = { schema: "fixture-query-v1", classCoordinates: ["1"], servicePid: process.pid };
  } else if (request.operation === "close") {
    result = { outcome: "closed", servicePid: process.pid };
  } else {
    process.stdout.write(JSON.stringify({ schema: "sagejs.class-groups/service-response-v1", abi: 1, id: request.id, ok: false, error: { schema: "sagejs.class-groups/service-response-v1", outcome: "error", category: "capability-declined", operation: request.operation, message: "unknown operation" } }) + "\\n");
    return;
  }
  process.stdout.write(JSON.stringify({ schema: "sagejs.class-groups/service-response-v1", abi: 1, id: request.id, ok: true, result }) + "\\n");
});
`;
  fs.writeFileSync(filename, source, { mode: 0o700 });
  return { filename, startup };
}

async function assertProcessExited(pid) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`class-group service process ${pid} survived host teardown`);
}

async function main() {
  if (process.platform === "win32") {
    const backend = new NodeClassGroupBackend();
    const capability = backend.call("capability", {});
    assert.equal(capability.outcome, "error");
    assert.equal(capability.category, "capability-declined");
    assert.equal(capability.route, "wasm-fallback");
    backend.close();
    console.log("Sage.js class-group runtime host passed (Windows fallback).");
    return;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-group-host-"));
  const previous = process.env.SAGEJS_CLASS_GROUP_SERVICE;
  try {
    const fixture = fakeService(directory);
    process.env.SAGEJS_CLASS_GROUP_SERVICE = fixture.filename;
    const target = {};
    const uninstall = installNodeHost(target);
    const host = target.__sagejs_host__;
    const backend = {
      call(operation, request) {
        const envelope = host.call("classGroup", [operation, request]);
        if (!envelope.ok) {
          const error = new Error(envelope.error.message);
          error.code = envelope.error.code;
          throw error;
        }
        return envelope.value;
      },
    };
    const capability = backend.call("capability", {});
    assert.deepEqual(capability, {
      schema: "sagejs.class-groups/service-response-v1",
      outcome: "available",
      operation: "capability",
      abi: 1,
      mathematicalScope: "absolute-monic-cubic-conditional-grh",
      maximumResidentSessions: 4,
      proofModes: ["conditional-grh"],
      imaginaryQuadratic: {
        proofMode: "unconditional",
        maximumAbsoluteDiscriminant: 200_000_000_000,
        operations: ["imaginary-class-number", "imaginary-class-group"],
      },
      operations: ["capability", "open", "summary", "publication", "query", "close",
        "imaginary-class-number", "imaginary-class-group"],
      route: "native-resident-worker",
      artifactSha256: crypto.createHash("sha256").update(fs.readFileSync(fixture.filename)).digest("hex"),
      artifactBytes: fs.statSync(fixture.filename).size,
    });
    assert.equal(fs.existsSync(fixture.startup), false, "capability probe must stay lazy");

    const imaginary = backend.call("imaginary-class-number", {
      polynomialAscending: ["6", "-1", "1"],
    });
    assert.equal(imaginary.result.classNumber, 3);
    assert.equal(fs.existsSync(fixture.startup), true);

    const groupRequest = ["imaginary-class-group", { polynomialAscending: ["1", "-1", "1"] }];
    const malformedCompact = host.call("classGroupCompact", ["imaginary-class-group", null]);
    assert.equal(malformedCompact.ok, false);
    assert.equal(malformedCompact.error.name, "TypeError");
    const fullGroup = host.call("classGroup", groupRequest);
    const compactGroup = host.call("classGroupCompact", groupRequest);
    assert.equal(fullGroup.ok, true);
    assert.equal(compactGroup.ok, true);
    assert.equal(fullGroup.value.result.completeClassMap.length, 1);
    assert.deepEqual(fullGroup.value.result.certificate.reducedForms, [{ a: 1, b: 1, c: 1 }]);
    assert.equal(compactGroup.value.result.completeClassMap, undefined);
    assert.deepEqual(compactGroup.value.result.completeClassMapPacked,
      [1, 1, 1, 1, 1, 1, 1, 1, 0, -1, 1]);
    assert.equal(compactGroup.value.result.completeClassMapLength, 1);
    assert.equal(compactGroup.value.result.certificate.reducedForms, undefined);
    assert.deepEqual(compactGroup.value.result.certificate.reducedFormsPacked, [1, 1, 1]);

    const opened = backend.call("open", { request: { polynomialAscending: ["-1", "-1", "0", "1"] } });
    assert.match(opened.generation, /^[0-9]+$/);
    assert.equal(opened.handle, "1");
    assert.equal(opened.artifactSha256, capability.artifactSha256);
    assert.equal(fs.existsSync(fixture.startup), true);
    const binding = { generation: opened.generation, handle: opened.handle };
    const publication = backend.call("publication", binding);
    const summary = backend.call("summary", binding);
    const query = backend.call("query", {
      ...binding,
      idealIntegralBasisRows: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]],
      resources: { maximumCandidates: 10 },
    });
    assert.equal(publication.servicePid, opened.servicePid);
    assert.equal(summary.servicePid, opened.servicePid);
    assert.equal(summary.artifactSha256, capability.artifactSha256);
    assert.equal(query.servicePid, opened.servicePid);
    assert.deepEqual(query.classCoordinates, ["1"]);
    assert.equal(backend.call("close", binding).outcome, "closed");
    uninstall();
    assert.equal(target.__sagejs_host__, undefined);
    await assertProcessExited(opened.servicePid);

    const restarted = new NodeClassGroupBackend();
    const beforeRestart = restarted.call("open", { request: {} });
    restarted.retireWorker();
    await assertProcessExited(beforeRestart.servicePid);
    const afterRestart = restarted.call("open", { request: {} });
    assert.notEqual(afterRestart.generation, beforeRestart.generation);
    assert.throws(
      () => restarted.call("publication", {
        generation: beforeRestart.generation,
        handle: beforeRestart.handle,
      }),
      (error) => error.code === "stale-handle",
    );
    restarted.call("close", {
      generation: afterRestart.generation,
      handle: afterRestart.handle,
    });
    restarted.close();
    await assertProcessExited(afterRestart.servicePid);

    const session = await createSage({ mode: "python" });
    try {
      const result = await session.evaluate([
        "import sagejs.runtime as runtime",
        "backend = runtime.class_group_backend()",
        "capability = backend.call('capability', {})",
        "print(capability['outcome'], capability['route'])",
        "opened = backend.call('open', {'request': {'polynomialAscending': ['-1', '-1', '0', '1']}})",
        "print(opened['handle'], opened['completion']['outcome'])",
        "print(backend.call('publication', {'generation': opened['generation'], 'handle': opened['handle']})['schema'])",
        "try:",
        "    backend.call('open', {'request': {'unsafe': 9007199254740993}})",
        "except OverflowError:",
        "    print('unsafe integer rejected')",
      ].join("\n"));
      assert.equal(
        result.stdout.trim(),
        "available native-resident-worker\n1 complete-conditional-grh\nfixture-publication-v1\nunsafe integer rejected",
      );
    } finally {
      await session.close();
    }

    const corruptFixture = fakeService(directory, true);
    process.env.SAGEJS_CLASS_GROUP_SERVICE = corruptFixture.filename;
    const corrupt = new NodeClassGroupBackend();
    assert.throws(
      () => corrupt.call("open", { request: {} }),
      (error) => error.code === "EBADMSG",
    );
    assert.throws(
      () => corrupt.call("imaginary-class-group", {
        polynomialAscending: ["1", "-1", "1"], transport: "core-v2",
      }),
      (error) => error.code === "EBADMSG",
    );
    corrupt.close();
    await assertProcessExited(Number(fs.readFileSync(corruptFixture.startup, "utf8")));

    const wrongIdFixture = fakeService(directory, false, true);
    process.env.SAGEJS_CLASS_GROUP_SERVICE = wrongIdFixture.filename;
    const wrongIdBackend = new NodeClassGroupBackend();
    assert.throws(
      () => wrongIdBackend.call("imaginary-class-group", {
        polynomialAscending: ["1", "-1", "1"], transport: "core-v2",
      }),
      (error) => error.code === "EBADMSG",
    );
    wrongIdBackend.close();
    await assertProcessExited(Number(fs.readFileSync(wrongIdFixture.startup, "utf8")));

    const declinedFixture = fakeService(directory, false, false, true);
    process.env.SAGEJS_CLASS_GROUP_SERVICE = declinedFixture.filename;
    const declinedBackend = new NodeClassGroupBackend();
    assert.throws(
      () => declinedBackend.call("imaginary-class-group", {
        polynomialAscending: ["1", "-1", "1"], transport: "core-v2",
      }),
      (error) => error.code === "capability-declined" &&
        error.message === "fixture packed decline",
    );
    declinedBackend.close();
    await assertProcessExited(Number(fs.readFileSync(declinedFixture.startup, "utf8")));

    const badCoreFixture = fakeService(directory, false, false, false, true);
    process.env.SAGEJS_CLASS_GROUP_SERVICE = badCoreFixture.filename;
    const badCoreTarget = {};
    const uninstallBadCore = installNodeHost(badCoreTarget);
    const badCoreResponse = badCoreTarget.__sagejs_host__.call("classGroupCompact", groupRequest);
    assert.equal(badCoreResponse.ok, false);
    assert.equal(badCoreResponse.error.code, "EBADMSG");
    uninstallBadCore();
    await assertProcessExited(Number(fs.readFileSync(badCoreFixture.startup, "utf8")));

    process.env.SAGEJS_CLASS_GROUP_SERVICE = path.join(directory, "missing");
    const unavailable = new NodeClassGroupBackend();
    const missing = unavailable.call("capability", {});
    assert.equal(missing.outcome, "error");
    assert.equal(missing.category, "capability-declined");
    assert.match(missing.message, /does not exist/);
    assert.throws(
      () => unavailable.call("open", { request: {} }),
      (error) => error.name === "ClassGroupUnavailableError",
    );
    unavailable.close();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_CLASS_GROUP_SERVICE;
    else process.env.SAGEJS_CLASS_GROUP_SERVICE = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("Sage.js class-group runtime host passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
