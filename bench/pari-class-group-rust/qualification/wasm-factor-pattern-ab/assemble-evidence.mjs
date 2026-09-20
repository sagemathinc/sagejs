import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const revision = "c4d07156194765506d137792732ba5109cd8c87e";
const [sourceRoot, destinationRoot, rawRoot] = process.argv.slice(2).map((value) =>
  path.resolve(value),
);
if (!sourceRoot || !destinationRoot || !rawRoot) {
  throw new Error(
    "usage: node assemble-evidence.mjs CLEAN_ROOT DESTINATION_ROOT RAW_RECEIPT_ROOT",
  );
}

const q = "bench/pari-class-group-rust/qualification";
const ab = `${q}/wasm-factor-pattern-ab`;
const factorBase = `${q}/wasm-prepared-factor-base`;
const relationPrefix = `${q}/wasm-prepared-relation-prefix`;
const neutralInput = `${q}/row6-candidate/inputs/row6-neutral-prepared-field.json`;

function run(command, args, cwd = sourceRoot) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function bytes(filename) {
  return fs.readFileSync(filename);
}

function identity(filename, displayPath = filename) {
  const value = bytes(filename);
  return {
    path: displayPath,
    sha256: crypto.createHash("sha256").update(value).digest("hex"),
    bytes: value.byteLength,
  };
}

function rooted(root, relative) {
  return path.resolve(root, relative);
}

function json(filename) {
  return JSON.parse(bytes(filename));
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function committedIdentity(relative) {
  const value = execFileSync("git", ["show", `${revision}:${relative}`], {
    cwd: sourceRoot,
  });
  return {
    path: relative,
    sha256: crypto.createHash("sha256").update(value).digest("hex"),
    bytes: value.byteLength,
  };
}

function closure(paths) {
  return paths.map(committedIdentity);
}

function median(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function browserMedians(receipt) {
  return Object.fromEntries(
    receipt.engines.map((engine) => [engine.engine, engine.timings_ms.call]),
  );
}

function enrichNative(rawName, executablePath, sourceClosure, libraries) {
  const rawFilename = path.join(rawRoot, rawName);
  const receipt = json(rawFilename);
  receipt.observedAt = fs.statSync(rawFilename).mtime.toISOString();
  receipt.repositoryRevision = revision;
  receipt.host = {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    uname: run("uname", ["-a"]),
  };
  receipt.tools = {
    rustc: run("rustc", ["-Vv"]),
    cargo: run("cargo", ["-V"]),
    cc: run("gcc", ["--version"]).split("\n")[0],
  };
  receipt.executable = {
    ...identity(rooted(sourceRoot, executablePath), executablePath),
    retained: false,
    identitySemantics:
      "frozen SHA-256 and byte count of the exact measured binary; path records its clean-worktree build location and is not a claim that a current file can be reopened there",
  };
  receipt.sourceClosure = closure(sourceClosure);
  receipt.nativeLibraries = libraries;
  return receipt;
}

if (run("git", ["rev-parse", "HEAD"]) !== revision) {
  throw new Error("clean evidence worktree is not at the qualified revision");
}
run("git", ["diff", "--quiet", revision, "--"]);

const common = run("git", ["rev-parse", "--git-common-dir"]);
const toolchainDigest =
  "37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c";
const toolchainRoot = path.resolve(sourceRoot, common, "sagejs-wasm-toolchains/v2", toolchainDigest);
const toolchainReceipt = json(path.join(toolchainRoot, "receipt.json"));
if (toolchainReceipt.lockDigest !== toolchainDigest) {
  throw new Error("prepared toolchain receipt has the wrong lock digest");
}

const nativePrefix = path.resolve(
  destinationRoot,
  "packages/flint/.native/prefix/lib",
);
const nativeLibraries = [
  identity(path.join(nativePrefix, "libgmp.a"), "packages/flint/.native/prefix/lib/libgmp.a"),
  identity(path.join(nativePrefix, "libmpfr.a"), "packages/flint/.native/prefix/lib/libmpfr.a"),
];

const browserClosure = [
  `${q}/browser/run-browser.mjs`,
  `${q}/browser/class-group-route.html`,
  `${q}/browser/class-group-route.mjs`,
  `${q}/browser/browser-loader.mjs`,
  "packages/flint-wasm/test/browser-wasm-support.mjs",
  "packages/flint-wasm/src/wasi-runtime.mjs",
  "packages/flint-wasm/src/wasi-constants.mjs",
  "packages/flint-wasm/src/wasi-filesystem.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "packages/flint-wasm/package.json",
];
const factorBaseSources = [
  "bench/pari-class-group-rust/src/factor_base.rs",
  "bench/pari-class-group-rust/src/hnf.rs",
  "bench/pari-class-group-rust/src/prepared.rs",
  "bench/pari-class-group-rust/src/prepared_factor_base.rs",
  "bench/pari-class-group-rust/src/prepared_ideal.rs",
  "bench/pari-class-group-rust/src/prepared_input.rs",
  "bench/pari-class-group-rust/src/relation_cache.rs",
];
const relationPrefixSources = [
  "bench/pari-class-group-rust/src/class_group.rs",
  "bench/pari-class-group-rust/src/collector_schedule.rs",
  "bench/pari-class-group-rust/src/enumeration.rs",
  ...factorBaseSources,
  "bench/pari-class-group-rust/src/ideal_arithmetic.rs",
  "bench/pari-class-group-rust/src/numerical_preparation.rs",
  "bench/pari-class-group-rust/src/pari_random.rs",
  "bench/pari-class-group-rust/src/prime_valuation.rs",
  "bench/pari-class-group-rust/src/smooth_admission.rs",
];
const abSources = [
  `${ab}/Cargo.toml`,
  `${ab}/Cargo.lock`,
  `${ab}/build-wasm.sh`,
  `${ab}/src/lib.rs`,
  `${ab}/src/main.rs`,
];
const factorBuildSources = [
  `${factorBase}/Cargo.toml`,
  `${factorBase}/Cargo.lock`,
  `${factorBase}/build.rs`,
  `${factorBase}/build-wasm.sh`,
  `${factorBase}/gmp-mpfr-cross-cc.sh`,
  `${factorBase}/prepare-vector.mjs`,
  `${factorBase}/src/lib.rs`,
  `${factorBase}/src/bin/native-benchmark.rs`,
  neutralInput,
  ...factorBaseSources,
];
const relationBuildSources = [
  `${relationPrefix}/Cargo.toml`,
  `${relationPrefix}/Cargo.lock`,
  `${relationPrefix}/build.rs`,
  `${relationPrefix}/build-wasm.sh`,
  `${relationPrefix}/gmp-mpfr-cross-cc.sh`,
  `${relationPrefix}/prepare-vector.mjs`,
  `${relationPrefix}/src/lib.rs`,
  `${relationPrefix}/src/bin/native-benchmark.rs`,
  neutralInput,
  ...relationPrefixSources,
];

const abNative = enrichNative(
  "factor-pattern-native-raw.json",
  `${ab}/target/release/sagejs-rust-wasm-factor-pattern-ab`,
  abSources,
  [],
);
const factorNative = enrichNative(
  "factor-base-native-raw.json",
  `${factorBase}/target/release/native-benchmark`,
  factorBuildSources,
  [nativeLibraries[0]],
);
const relationNative = enrichNative(
  "relation-prefix-native-raw.json",
  `${relationPrefix}/target/release/native-benchmark`,
  relationBuildSources,
  nativeLibraries,
);

const outputs = {
  abNative: `${ab}/native-receipt.json`,
  abBaselineBrowser: `${ab}/baseline.browser-receipt.json`,
  abBoundedBrowser: `${ab}/bounded-i64.browser-receipt.json`,
  factorNative: `${factorBase}/optimized-native-receipt.json`,
  factorBrowser: `${factorBase}/optimized-receipt.json`,
  relationNative: `${relationPrefix}/factor-pattern-optimized-native-receipt.json`,
  relationBrowser: `${relationPrefix}/factor-pattern-optimized-receipt.json`,
};
writeJson(rooted(destinationRoot, outputs.abNative), abNative);
writeJson(rooted(destinationRoot, outputs.factorNative), factorNative);
writeJson(rooted(destinationRoot, outputs.relationNative), relationNative);
// Browser receipts are written directly by the real-browser runner into the
// destination worktree. Do not silently copy a receipt from another tree.
for (const key of [
  "abBaselineBrowser",
  "abBoundedBrowser",
  "factorBrowser",
  "relationBrowser",
]) {
  if (!fs.existsSync(rooted(destinationRoot, outputs[key]))) {
    throw new Error(`missing browser-runner output ${outputs[key]}`);
  }
}

const baselineBrowser = json(rooted(destinationRoot, outputs.abBaselineBrowser));
const boundedBrowser = json(rooted(destinationRoot, outputs.abBoundedBrowser));
const factorBrowser = json(rooted(destinationRoot, outputs.factorBrowser));
const relationBrowser = json(rooted(destinationRoot, outputs.relationBrowser));
const factorBeforeNative = json(rooted(destinationRoot, `${factorBase}/native-receipt.json`));
const factorBeforeBrowser = json(rooted(destinationRoot, `${factorBase}/receipt.json`));
const relationBeforeNative = json(rooted(destinationRoot, `${relationPrefix}/native-receipt.json`));
const relationBeforeBrowser = json(rooted(destinationRoot, `${relationPrefix}/receipt.json`));

const historicalEvidence = {
  preparedFactorBase: {
    receiptCommit: "b6a55b85ca4c1195f456bacf530421c9831af189",
    measuredRevision: factorBeforeBrowser.repository_revision,
    revisionProvenance:
      "native and browser receipts were committed together; the browser receipt embeds the measured source revision while the historical native schema predates embedded revision metadata",
    native: identity(
      rooted(destinationRoot, `${factorBase}/native-receipt.json`),
      `${factorBase}/native-receipt.json`,
    ),
    browser: identity(
      rooted(destinationRoot, `${factorBase}/receipt.json`),
      `${factorBase}/receipt.json`,
    ),
  },
  relationPrefix: {
    receiptCommit: "9273f3e2f695dac692c9b1d6e73bf9c9597aa602",
    measuredRevision: relationBeforeBrowser.repository_revision,
    revisionProvenance:
      "native and browser receipts were committed together; the browser receipt embeds the measured source revision while the historical native schema predates embedded revision metadata",
    native: identity(
      rooted(destinationRoot, `${relationPrefix}/native-receipt.json`),
      `${relationPrefix}/native-receipt.json`,
    ),
    browser: identity(
      rooted(destinationRoot, `${relationPrefix}/receipt.json`),
      `${relationPrefix}/receipt.json`,
    ),
  },
};

const evidence = Object.fromEntries(
  Object.entries(outputs).map(([key, relative]) => [
    key,
    identity(rooted(destinationRoot, relative), relative),
  ]),
);
const optimization = {
  schema: "sagejs.rust-class-group/factor-pattern-optimization-evidence-v2",
  status: "pass",
  observedAt: new Date().toISOString(),
  repositoryRevision: revision,
  workload: {
    polynomialAscending: [2000000000018, -2000000000010, 0, 1],
    bound: 9196,
    rationalPrimeCount: 1139,
    factorCount: 2066,
    factorPatternDigestSha256:
      "e0b4936ea49e92649808af36cafb8d4820a54cca0d57260d293ce7d696271bbb",
    factorBaseDescriptorSha256:
      "dc63c73dbc419b05a4a1b907cdd8a60f70247f74a0d477880eb25d19c4356306",
    relationPrefixSha256:
      "7e4c9242d3fa92c7bc7f8fbb3e9c68cc77f66cbc5838657cf38e610c66ba22b3",
  },
  sourceClosure: {
    factorPattern: closure(abSources),
    preparedFactorBase: closure(factorBuildSources),
    relationPrefix: closure(relationBuildSources),
    browserHarness: closure(browserClosure),
  },
  buildClosure: {
    rustc: run("rustc", ["-Vv"]),
    cargo: run("cargo", ["-V"]),
    toolchainDigest,
    toolchainReceipt: identity(path.join(toolchainRoot, "receipt.json"), "prepared-toolchain/receipt.json"),
    toolchain: {
      clang: run(path.join(toolchainRoot, "sdk/bin/clang"), ["--version"]),
      wasmLd: run(path.join(toolchainRoot, "sdk/bin/wasm-ld"), ["--version"]),
      gmp: {
        ...toolchainReceipt.libraries.gmp,
        artifact: identity(path.join(toolchainRoot, "prefixes/gmp/lib/libgmp.a"), "prepared-toolchain/prefixes/gmp/lib/libgmp.a"),
      },
      mpfr: {
        ...toolchainReceipt.libraries.mpfr,
        artifact: identity(path.join(toolchainRoot, "prefixes/mpfr/lib/libmpfr.a"), "prepared-toolchain/prefixes/mpfr/lib/libmpfr.a"),
      },
    },
    artifacts: {
      factorPattern: baselineBrowser.artifact,
      preparedFactorBase: factorBrowser.artifact,
      relationPrefix: relationBrowser.artifact,
    },
    vectors: {
      factorPatternBaseline: baselineBrowser.vector,
      factorPatternBoundedI64: boundedBrowser.vector,
      preparedFactorBase: factorBrowser.vector,
      relationPrefix: relationBrowser.vector,
    },
  },
  evidence,
  historicalEvidence,
  comparisons: {
    factorPattern: {
      native: Object.fromEntries(abNative.modes.map((mode) => [mode.mode, mode.medianMs])),
      browserBaseline: browserMedians(baselineBrowser),
      browserBoundedI64: browserMedians(boundedBrowser),
    },
    preparedFactorBase: {
      before: {
        native: factorBeforeNative.medianMs,
        browser: browserMedians(factorBeforeBrowser),
      },
      after: {
        native: factorNative.medianMs,
        browser: browserMedians(factorBrowser),
      },
    },
    relationPrefix: {
      before: {
        native: relationBeforeNative.medianMs,
        browser: browserMedians(relationBeforeBrowser),
      },
      after: {
        native: relationNative.medianMs,
        browser: browserMedians(relationBrowser),
      },
    },
  },
};
writeJson(rooted(destinationRoot, `${ab}/optimization-receipt.json`), optimization);

console.log(
  JSON.stringify(
    {
      status: "pass",
      revision,
      nativeMedians: {
        factorPattern: abNative.modes.map((mode) => [mode.mode, mode.medianMs]),
        preparedFactorBase: factorNative.medianMs,
        relationPrefix: relationNative.medianMs,
      },
      browserMedians: {
        factorPatternBaseline: browserMedians(baselineBrowser),
        factorPatternBoundedI64: browserMedians(boundedBrowser),
        preparedFactorBase: browserMedians(factorBrowser),
        relationPrefix: browserMedians(relationBrowser),
      },
      medianChecks: [
        ...abNative.modes.map((mode) => median(mode.samplesMs) === mode.medianMs),
        median(factorNative.samplesMs) === factorNative.medianMs,
        median(relationNative.samplesMs) === relationNative.medianMs,
      ],
    },
    null,
    2,
  ),
);
