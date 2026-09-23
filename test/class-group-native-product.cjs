// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  ARTIFACT_SCHEMA,
  NativeClassGroupClosedError,
  NativeClassGroupInterruptedError,
  createNativeClassGroupBackend,
  createNativeClassGroupService,
  nativeClassGroupCapability,
} = require("../packages/class-groups/js/native-service.cjs");

const root = resolve(__dirname, "..");
const temporaryDirectories = new Set();

function temporary(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const fakeService = `#!/usr/bin/env node
"use strict";
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const response = (request, result) => process.stdout.write(JSON.stringify({
  schema: "sagejs.class-groups/service-response-v1", abi: 1, id: request.id,
  ok: true, result,
}) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.operation === "crash") process.exit(23);
  if (request.operation === "capability") return response(request, { abi: 1, resident: true });
  if (request.operation === "open") return response(request, { generation: "41", handle: "7" });
  if (request.operation === "publication") return response(request, {
    generation: request.generation, handle: request.handle, published: true,
  });
  if (request.operation === "summary") return response(request, {
    schema: "sagejs.class-groups/compact-summary-v1",
    outcome: "complete-conditional-grh",
  });
  if (request.operation === "query") return response(request, {
    generation: request.generation, handle: request.handle,
    idealIntegralBasisRows: request.idealIntegralBasisRows,
  });
  if (request.operation === "close") return response(request, {
    generation: request.generation, handle: request.handle, outcome: "closed",
  });
  response(request, { operation: request.operation });
});
`;

function installFakePackage({ corrupt = false, manifest = true } = {}) {
  const packageRoot = temporary("sagejs-class-group-native-");
  const libexec = join(packageRoot, "libexec");
  const native = join(packageRoot, "native");
  mkdirSync(libexec);
  mkdirSync(native);
  const executable = join(libexec, "class-group-service");
  writeFileSync(executable, fakeService);
  chmodSync(executable, 0o755);
  const contents = readFileSync(executable);
  if (manifest) {
    writeFileSync(join(native, "class-group-service.json"), `${JSON.stringify({
      schema: ARTIFACT_SCHEMA,
      abi: 1,
      target: "linux-x64",
      executable: "libexec/class-group-service",
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    })}\n`);
  }
  if (corrupt) writeFileSync(executable, `${fakeService}\n// modified after packaging\n`);
  return packageRoot;
}

test("authenticates a relocated native artifact and runs the resident protocol", async () => {
  const packageRoot = installFakePackage();
  const capability = nativeClassGroupCapability({ packageRoot, target: "linux-x64" });
  assert.equal(capability.available, true);
  assert.equal(capability.manifest.sha256.length, 64);

  const service = await createNativeClassGroupService({ capability, required: true });
  assert.deepEqual(await service.capability(), {
    abi: 1,
    resident: true,
    artifactSha256: capability.manifest.sha256,
    artifactTarget: "linux-x64",
  });
  const session = await service.open({ polynomialAscending: ["-1", "-1", "0", "1"] });
  assert.equal(session.handle, "7");
  assert.deepEqual(await session.publication(), {
    generation: "41",
    handle: "7",
    published: true,
  });
  assert.deepEqual(await session.summary(), {
    schema: "sagejs.class-groups/compact-summary-v1",
    outcome: "complete-conditional-grh",
    artifactSha256: capability.manifest.sha256,
  });
  const rows = [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]];
  assert.deepEqual((await session.query(rows, {})).idealIntegralBasisRows, rows);
  await session.close();
  await service.close();
  await service.close();
  await assert.rejects(service.capability(), NativeClassGroupClosedError);
});

test("missing and corrupt artifacts decline as tested capabilities", async () => {
  const missing = nativeClassGroupCapability({
    packageRoot: installFakePackage({ manifest: false }),
    target: "linux-x64",
  });
  assert.equal(missing.available, false);
  assert.match(missing.reason, /manifest is unavailable/);
  assert.equal(await createNativeClassGroupService({ capability: missing }), undefined);

  const corrupt = nativeClassGroupCapability({
    packageRoot: installFakePackage({ corrupt: true }),
    target: "linux-x64",
  });
  assert.equal(corrupt.available, false);
  assert.match(corrupt.reason, /failed authentication/);
  assert.equal(await createNativeClassGroupService({ capability: corrupt }), undefined);
});

test("a crashed process rejects its request and restarts without replay", async () => {
  const capability = nativeClassGroupCapability({
    packageRoot: installFakePackage(),
    target: "linux-x64",
  });
  const service = await createNativeClassGroupService({ capability, required: true });
  const session = await service.open({ polynomialAscending: ["-1", "-1", "0", "1"] });
  const firstGeneration = service.generation;
  await assert.rejects(service.invoke("crash"), NativeClassGroupInterruptedError);
  assert.equal(service.generation, firstGeneration);
  assert.equal((await service.capability()).resident, true);
  assert.equal(service.generation, firstGeneration + 1);
  assert.throws(() => session.publication(), NativeClassGroupInterruptedError);
  await service.close();
});

test("unboxed backend calls are exposed only after authenticated capability handshake", async () => {
  const capability = nativeClassGroupCapability({
    packageRoot: installFakePackage(),
    target: "linux-x64",
  });
  const backend = await createNativeClassGroupBackend({ capability, required: true });
  assert.equal(backend.artifactSha256, capability.manifest.sha256);
  assert.equal(backend.capabilities.abi, 1);
  assert.equal(backend.capabilities.artifactSha256, capability.manifest.sha256);
  assert.deepEqual(await backend.call("echo", { value: 3 }), { operation: "echo" });
  await backend.close();
});

test("platform packager keeps two-executable calls and optionally authenticates service", () => {
  const inputs = temporary("sagejs-class-group-packager-");
  const sagejs = join(inputs, "sagejs");
  const sagepython = join(inputs, "sagepython");
  const service = join(inputs, "class-group-service");
  for (const filename of [sagejs, sagepython]) {
    writeFileSync(filename, "#!/bin/sh\nexit 0\n");
    chmodSync(filename, 0o755);
  }
  writeFileSync(service, fakeService);
  chmodSync(service, 0o755);
  const script = join(root, "scripts", "build-npm-platform-package.cjs");

  execFileSync(process.execPath, [script, "linux-x64", sagejs, sagepython], {
    cwd: root,
    stdio: "pipe",
  });
  let archive = join(root, "build", "release", "npm", "sagejs-linux-x64.tgz");
  let members = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.doesNotMatch(members, /class-group-service/);

  execFileSync(process.execPath, [script, "linux-x64", sagejs, sagepython, service], {
    cwd: root,
    stdio: "pipe",
  });
  members = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.match(members, /package\/libexec\/class-group-service/);
  assert.match(members, /package\/native\/class-group-service\.json/);
  assert.match(members, /package\/native\/class-group-service\.cjs/);
  const receipt = JSON.parse(execFileSync(
    "tar",
    ["-xOzf", archive, "package/native/class-group-service.json"],
    { encoding: "utf8" },
  ));
  assert.equal(receipt.bytes, readFileSync(service).byteLength);
  assert.equal(receipt.sha256, createHash("sha256").update(readFileSync(service)).digest("hex"));

  const windows = spawnSync(
    process.execPath,
    [script, "windows-x64", sagejs, sagepython, service],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(windows.status, 0);
  assert.match(windows.stderr, /not qualified for Windows/);
});
