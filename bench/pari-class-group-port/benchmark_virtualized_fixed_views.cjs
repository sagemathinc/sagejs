"use strict";

/*
 * Validate and benchmark a candidate fixed-UInt64-view virtualization build
 * against the committed Stage-D checked-region build.
 *
 * Both arguments are already-built native-kernel directories containing
 * `index.cjs`, `kernel_core.c`, and `build/Release/sagejs_native_kernel.node`.
 * The harness never rebuilds or rewrites either artifact.
 *
 * Usage:
 *   node benchmark_virtualized_fixed_views.cjs \
 *     FIXTURES_JSON STAGE_D_DIRECTORY CANDIDATE_DIRECTORY \
 *     [MATERIALIZED_REFERENCE_DIRECTORY]
 */

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const rawArguments = process.argv.slice(2);
const validateOnly = rawArguments.at(-1) === "--validate-only";
if (validateOnly) rawArguments.pop();
const [fixturesArgument, stageDArgument, candidateArgument, referenceArgument] =
  rawArguments;
if (!candidateArgument) {
  throw new Error(
    "usage: node benchmark_virtualized_fixed_views.cjs " +
      "FIXTURES_JSON STAGE_D_DIRECTORY CANDIDATE_DIRECTORY " +
      "[MATERIALIZED_REFERENCE_DIRECTORY]",
  );
}

const ENTRY = "int64_pari_prime_degree_catalog";
const PUBLIC_COPY = "int64_pari_flx_copy";
const BACKENDS = Object.freeze(["javascript", "gmp", "tagged"]);
const PRIVATE_PREFIX = "tagged_sagejs_checked_r0_";
const fixturesPath = resolve(fixturesArgument);
const stageDDirectory = resolve(stageDArgument);
const candidateDirectory = resolve(candidateArgument);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

function snapshot(arguments_) {
  return arguments_.map((value) => {
    if (typeof value === "bigint") return String(value);
    if (typeof value.toArray === "function") return value.toArray().map(String);
    return Array.from(value).map(String);
  });
}

function makeArguments(kernel, packet) {
  return packet.map((entry, index) => {
    if (!Array.isArray(entry)) return BigInt(entry);
    if (index === 8) return kernel.createUInt64Buffer(entry.map(BigInt));
    if ([5, 6, 7].includes(index)) {
      return kernel.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
    }
    return kernel.createInt64Buffer(entry.map(BigInt));
  });
}

function execute(kernel, backend, packet) {
  const arguments_ = makeArguments(kernel, packet);
  let outcome;
  try {
    outcome = { kind: "result", value: String(kernel[backend](...arguments_)) };
  } catch (error) {
    outcome = {
      kind: "exception",
      name: error?.name || null,
      message: error?.message || String(error),
    };
  }
  return { outcome, arguments: snapshot(arguments_) };
}

function executePublicCopy(copy, backend, values, a, degree, out) {
  const storage = copy.createUInt64Buffer(values.map(BigInt));
  let outcome;
  try {
    outcome = {
      kind: "result",
      value: String(copy[backend](storage, BigInt(a), BigInt(degree), BigInt(out))),
    };
  } catch (error) {
    outcome = {
      kind: "exception",
      name: error?.name || null,
      message: error?.message || String(error),
    };
  }
  return { outcome, storage: snapshot([storage])[0] };
}

function changedPacket(packet, change) {
  const copy = structuredClone(packet);
  change(copy);
  return copy;
}

function elfTextBytes(filename) {
  if (process.platform !== "linux") return null;
  const measured = spawnSync("size", [filename], { encoding: "utf8" });
  if (measured.status !== 0) return null;
  const line = measured.stdout.trim().split("\n").at(-1);
  const value = Number(line.trim().split(/\s+/, 1)[0]);
  return Number.isSafeInteger(value) ? value : null;
}

function privateDefinitions(core) {
  const definition = new RegExp(
    `(?:static|SAGEJS_CHECKED_REGION_HOT_INLINE) int ` +
      `${PRIVATE_PREFIX}${ENTRY}\\([^;]+\\)\\n\\{`,
  ).exec(core);
  assert(definition, "missing checked-region private entry definition");
  const start = definition.index;
  const native = new RegExp(
    `static int native_${ENTRY}\\([^;]+\\)\\n\\{`,
  ).exec(core.slice(start));
  assert(native, "missing native entry after checked-region definitions");
  const privateCore = core.slice(start, start + native.index);
  assert.match(
    core,
    new RegExp(`return ${PRIVATE_PREFIX}${ENTRY}\\(`),
    "missing checked-region dispatch",
  );
  return privateCore;
}

function count(source, expression) {
  return (source.match(expression) || []).length;
}

function siteCounts(privateCore) {
  return {
    viewValidationFailures: count(
      privateCore,
      /UInt64Buffer view is outside its buffer/g,
    ),
    uint64BufferLocalDeclarations: count(
      privateCore,
      /sagejs_uint64_buffer\s+[A-Za-z0-9_]+\s*=\s*\{0\}/g,
    ),
    viewDataAssignments: count(privateCore, /\.data =/g),
    viewLengthAssignments: count(privateCore, /\.length =/g),
    viewOffsetAdjustments: count(privateCore, /\.data \+=/g),
    signedBufferIndexCalls: count(
      privateCore,
      /sagejs_signed_buffer_index\(/g,
    ),
    uint64BoundsFailures: count(
      privateCore,
      /UInt64Buffer index out of range/g,
    ),
    int64BoundsFailures: count(
      privateCore,
      /(?<!U)Int64Buffer index out of range/g,
    ),
  };
}

function loadBuild(name, directory) {
  const module = require(join(directory, "index.cjs"));
  const kernel = module[ENTRY];
  const publicCopy = module[PUBLIC_COPY];
  assert(kernel, `${name}: missing ${ENTRY}`);
  assert(publicCopy, `${name}: missing ${PUBLIC_COPY}`);
  assert.equal(
    kernel.nativeAvailable,
    true,
    `${name}: native addon unavailable`,
  );
  for (const backend of BACKENDS) {
    assert.equal(
      typeof kernel[backend],
      "function",
      `${name}: missing ${backend}`,
    );
    assert.equal(
      typeof publicCopy[backend],
      "function",
      `${name}: missing ${PUBLIC_COPY}.${backend}`,
    );
  }
  const coreBytes = readFileSync(join(directory, "kernel_core.c"));
  const core = coreBytes.toString("utf8");
  const privateCore = privateDefinitions(core);
  const addon = join(directory, "build/Release/sagejs_native_kernel.node");
  return {
    name,
    directory,
    kernel,
    publicCopy,
    coreBytes,
    privateCore,
    addon,
    counts: siteCounts(privateCore),
  };
}

function batch(build, arguments_, repetitions) {
  const start = process.hrtime.bigint();
  for (let index = 0; index < repetitions; index += 1) {
    assert.equal(Number(build.kernel.tagged(...arguments_)), 0);
  }
  return Number(process.hrtime.bigint() - start) / 1e6;
}

const fixtureBytes = readFileSync(fixturesPath);
const fixtures = JSON.parse(fixtureBytes);
assert.equal(fixtures.packets.length, 4, "expected four frozen Stage-D packets");
assert.equal(fixtures.expected.length, fixtures.packets.length);

const builds = [
  loadBuild("stage-d", stageDDirectory),
  loadBuild("candidate", candidateDirectory),
];
const materializedReference = referenceArgument
  ? loadBuild("materialized-reference", resolve(referenceArgument))
  : null;

const frozenValidation = [];
for (const backend of BACKENDS) {
  for (let index = 0; index < fixtures.packets.length; index += 1) {
    const expected = {
      outcome: {
        kind: "result",
        value: String(fixtures.expected[index].result),
      },
      arguments: fixtures.expected[index].args,
    };
    const stageD = execute(builds[0].kernel, backend, fixtures.packets[index]);
    const candidate = execute(
      builds[1].kernel,
      backend,
      fixtures.packets[index],
    );
    if (backend === "tagged") {
      assert.deepEqual(stageD, expected, `Stage D ${backend}/packet-${index}`);
      assert.deepEqual(
        candidate,
        expected,
        `candidate ${backend}/packet-${index}`,
      );
    }
    assert.deepEqual(
      candidate,
      stageD,
      `differential ${backend}/packet-${index}`,
    );
    frozenValidation.push({ backend, packet: index });
  }
}

const malformedDefinitions = [
  [
    "short-state",
    (packet) => {
      packet[22] = packet[22].slice(0, 3);
    },
  ],
  [
    "bad-degree",
    (packet) => {
      packet[1] = "5";
    },
  ],
  [
    "short-coefficients",
    (packet) => {
      packet[0] = packet[0].slice(0, Number(packet[1]));
    },
  ],
  [
    "short-primes",
    (packet) => {
      packet[3] = packet[3].slice(0, -1);
    },
  ],
  [
    "short-word-workspace",
    (packet) => {
      packet[8] = packet[8].slice(0, 392);
    },
  ],
  [
    "short-output",
    (packet) => {
      packet[17] = packet[17].slice(0, -3);
    },
  ],
  [
    "nonmonic",
    (packet) => {
      packet[0][Number(packet[1])] = "2";
    },
  ],
  [
    "invalid-prime",
    (packet) => {
      packet[3][0] = "1";
    },
  ],
  [
    "oversized-prime",
    (packet) => {
      packet[3][0] = "3037000499";
    },
  ],
];

const malformedValidation = [];
for (const [name, change] of malformedDefinitions) {
  const packet = changedPacket(fixtures.packets[0], change);
  for (const backend of BACKENDS) {
    const stageD = execute(builds[0].kernel, backend, packet);
    const candidate = execute(builds[1].kernel, backend, packet);
    assert.deepEqual(candidate, stageD, `malformed ${name}/${backend}`);
    malformedValidation.push({ name, backend, outcome: stageD.outcome });
  }
}

const publicCopyCases = [];
for (const degree of [-2, -1, 0, 1, 3, 8, 9]) {
  publicCopyCases.push({ name: `degree-${degree}`, a: 4, degree, out: 16 });
}
publicCopyCases.push(
  { name: "invalid-source-negative", a: -1, degree: 3, out: 16 },
  { name: "invalid-source-past-end", a: 24, degree: 3, out: 16 },
  { name: "invalid-output-negative", a: 4, degree: 3, out: -1 },
  { name: "invalid-output-past-end", a: 4, degree: 3, out: 24 },
  { name: "overlap-left", a: 8, degree: 8, out: 4 },
  { name: "overlap-right", a: 4, degree: 8, out: 8 },
  { name: "overlap-exact", a: 4, degree: 8, out: 4 },
  { name: "disjoint", a: 1, degree: 8, out: 16 },
);
const publicCopyValidation = [];
const publicCopyValues = Array.from({ length: 32 }, (_, index) =>
  String(1000 + 17 * index)
);
for (const testCase of publicCopyCases) {
  for (const backend of BACKENDS) {
    const reference = executePublicCopy(
      builds[0].publicCopy,
      backend,
      publicCopyValues,
      testCase.a,
      testCase.degree,
      testCase.out,
    );
    const candidate = executePublicCopy(
      builds[1].publicCopy,
      backend,
      publicCopyValues,
      testCase.a,
      testCase.degree,
      testCase.out,
    );
    assert.deepEqual(
      candidate,
      reference,
      `public copy ${testCase.name}/${backend}`,
    );
    publicCopyValidation.push({
      ...testCase,
      backend,
      outcome: candidate.outcome,
    });
  }
}

let measurements = null;
if (!validateOnly) {
  for (const build of builds) {
    build.arguments = makeArguments(build.kernel, fixtures.packets[0]);
    const pilot = batch(build, build.arguments, 3) / 3;
    build.repetitions = Math.max(1, Math.ceil(1200 / pilot));
    build.samples = [];
  }
  for (let warmup = 0; warmup < 3; warmup += 1) {
    for (const build of builds) batch(build, build.arguments, build.repetitions);
  }
  for (let pair = 0; pair < 7; pair += 1) {
    const order = pair % 2 === 0 ? builds : builds.toReversed();
    for (const build of order) {
      const elapsed = batch(build, build.arguments, build.repetitions);
      assert(elapsed >= 900, `${build.name}: retained batch too short`);
      build.samples.push(elapsed / build.repetitions);
    }
  }
  measurements = Object.fromEntries(
    builds.map((build) => [
      build.name,
      {
        repetitions: build.repetitions,
        milliseconds: build.samples,
        geometricMeanMilliseconds: geometricMean(build.samples),
      },
    ]),
  );
}
const counts = Object.fromEntries(
  builds.map((build) => [build.name, build.counts]),
);
if (materializedReference !== null) {
  counts[materializedReference.name] = materializedReference.counts;
}
function eliminatedSites(reference, candidate) {
  return Object.fromEntries(
    Object.keys(reference).map((key) => [key, reference[key] - candidate[key]]),
  );
}
const eliminatedVersusStageD = eliminatedSites(
  builds[0].counts,
  builds[1].counts,
);
const eliminatedVersusMaterializedReference = materializedReference === null
  ? null
  : eliminatedSites(materializedReference.counts, builds[1].counts);
/*
 * A positive delta means the candidate emitted fewer static sites. The
 * optional materialized reference is the direct counterfactual for view
 * virtualization; Stage D remains the timing and semantic reference.
 */
const artifactBuilds = materializedReference === null
  ? builds
  : [...builds, materializedReference];

const artifacts = Object.fromEntries(
  artifactBuilds.map((build) => [
    build.name,
    {
      directory: build.directory,
      coreSha256: sha256(build.coreBytes),
      coreBytes: build.coreBytes.length,
      privateCoreBytes: Buffer.byteLength(build.privateCore),
      addonBytes: statSync(build.addon).size,
      elfTextBytes: elfTextBytes(build.addon),
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      schema: "sagejs.checked-region/virtualized-fixed-uint64-views-v1",
      entry: ENTRY,
      boundary: "tagged frozen packet zero; packing and assertions excluded",
      fixtureSha256: sha256(fixtureBytes),
      frozenValidation,
      activeOutputs: 7081,
      malformedValidation,
      publicCopyValidation,
      staticPrivateSiteCounts: counts,
      eliminatedStaticPrivateSitesVersusStageD: eliminatedVersusStageD,
      eliminatedStaticPrivateSitesVersusMaterializedReference:
        eliminatedVersusMaterializedReference,
      artifacts,
      timing: validateOnly
        ? null
        : {
            protocol: {
              warmupRounds: 3,
              alternatingPairs: 7,
              targetBatchMilliseconds: 1200,
              minimumRetainedBatchMilliseconds: 900,
            },
            measurements,
            candidateToStageDRatio:
              measurements.candidate.geometricMeanMilliseconds /
              measurements["stage-d"].geometricMeanMilliseconds,
          },
    },
    null,
    2,
  ),
);
