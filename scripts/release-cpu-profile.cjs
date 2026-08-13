"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { arch, platform } = require("node:os");
const { basename, join, resolve } = require("node:path");

const {
  validateGmpConfigureObservation,
  validatePortableReleaseCpuProfile,
} = require("./native-math-profile.cjs");
const {
  validateNativeDependencyReceipt,
} = require("./native-dependency-receipt.cjs");

const REPORT_SCHEMA = "sagejs.release-cpu-profile-report-v1";

function readJson(filename) {
  if (!existsSync(filename)) {
    throw new Error(`native dependency receipt is missing: ${filename}`);
  }
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(
      `native dependency receipt is invalid JSON: ${filename}: ` +
        `${error.message || error}`,
    );
  }
}

function profileSummary(id, filename, profile) {
  validatePortableReleaseCpuProfile(profile);
  return {
    baseline: profile.cpuPolicy.baseline,
    fingerprint: profile.fingerprint,
    id,
    receipt: basename(filename),
  };
}

function requireReceiptOutputs(id, receipt, paths) {
  const files = new Map(receipt.outputs.files.map((file) => [file.path, file]));
  for (const path of paths) {
    if (files.get(path)?.type !== "file") {
      throw new Error(`${id} dependency receipt does not bind ${path}`);
    }
  }
}

function validateReleaseCpuProfile(options = {}) {
  const root = resolve(options.root || join(__dirname, ".."));
  const target = options.target || { arch: arch(), platform: platform() };
  const prefixes = {
    fflas: resolve(options.fflasPrefix || join(root, "packages", "fflas", ".native", "prefix")),
    flint: resolve(options.flintPrefix || join(root, "packages", "flint", ".native", "prefix")),
    graph: resolve(options.graphPrefix || join(root, "packages", "graph", ".native", "prefix")),
    m4ri: resolve(options.m4riPrefix || join(root, "packages", "m4ri", ".native", "prefix")),
  };
  const filenames = {
    fflas: join(prefixes.fflas, ".sagejs-fflas-dependencies.json"),
    flint: join(prefixes.flint, ".sagejs-flint-dependencies.json"),
    graph: join(prefixes.graph, ".sagejs-igraph-1.0.1"),
    m4ri: join(prefixes.m4ri, ".sagejs-m4ri-dependencies.json"),
  };
  const flint = validateNativeDependencyReceipt(readJson(filenames.flint), {
    prefix: prefixes.flint,
    stampPath: filenames.flint,
  });
  const fflas = validateNativeDependencyReceipt(readJson(filenames.fflas), {
    prefix: prefixes.fflas,
    stampPath: filenames.fflas,
  });
  const graph = validateNativeDependencyReceipt(readJson(filenames.graph), {
    prefix: prefixes.graph,
    stampPath: filenames.graph,
  });
  const m4ri = validateNativeDependencyReceipt(readJson(filenames.m4ri), {
    prefix: prefixes.m4ri,
    stampPath: filenames.m4ri,
  });
  const profiles = {
    fflas: fflas.mathProfile,
    flint: flint.mathProfile,
    graph: graph.mathProfile,
    m4ri: m4ri.mathProfile,
  };
  requireReceiptOutputs(
    "flint",
    flint,
    target.platform === "win32"
      ? ["lib/flint.lib", "lib/openblas.lib"]
      : ["lib/libflint.a", "lib/libgmp.a", "lib/libopenblas.a"],
  );
  requireReceiptOutputs(
    "fflas",
    fflas,
    target.platform === "win32"
      ? ["include/sagejs/fflas_matrix_ffi.h"]
      : [
          "include/sagejs/fflas_matrix_ffi.h",
          "lib/libgivaro.a",
          "lib/libgmpxx.a",
          target.platform === "darwin"
            ? "lib/Accelerate.tbd"
            : "lib/libopenblas.a",
        ],
  );
  for (const [id, profile] of Object.entries(profiles)) {
    if (profile?.abi?.arch !== target.arch || profile?.abi?.platform !== target.platform) {
      throw new Error(`${id} native dependency receipt does not match ${target.platform}/${target.arch}`);
    }
  }
  if (target.platform === "win32") {
    if (
      flint.build?.configuration?.windows?.openblasTarget !== "GENERIC" ||
      flint.build?.configuration?.windows?.triplet !==
        "x64-windows-static-md-release" ||
      !/^[0-9a-f]{64}$/.test(
        flint.build?.configuration?.windows?.manifestSha256 ?? "",
      ) ||
      !/^[0-9a-f]{64}$/.test(
        flint.build?.configuration?.windows?.tripletSha256 ?? "",
      ) ||
      fflas.capability !== false ||
      m4ri.capability !== false ||
      m4ri.build?.instructionPolicy !== "unavailable" ||
      m4ri.build?.cachePolicy !== "unavailable"
    ) {
      throw new Error("Windows dependency receipts do not implement their portable CPU policy");
    }
  } else {
    validateGmpConfigureObservation(
      profiles.flint,
      flint.build?.observed?.gmpConfigure,
    );
    validateGmpConfigureObservation(
      profiles.fflas,
      fflas.build?.observed?.gmpConfigure,
    );
    if (
      m4ri.build?.instructionPolicy !== profiles.m4ri.cpuPolicy.baseline ||
      m4ri.build?.cachePolicy?.kind !== "fixed-portable"
    ) {
      throw new Error("M4RI receipt does not implement its portable CPU policy");
    }
  }
  if (graph.build?.instructionPolicy !== profiles.graph.cpuPolicy.baseline) {
    throw new Error("igraph receipt does not implement its portable CPU policy");
  }
  return {
    dependencies: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [
      id,
      profileSummary(id, filenames[id], profile),
    ])),
    schema: REPORT_SCHEMA,
    target,
  };
}

function main(arguments_) {
  if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--json")) {
    throw new Error("usage: node scripts/release-cpu-profile.cjs [--json]");
  }
  const report = validateReleaseCpuProfile();
  if (arguments_[0] === "--json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `Portable native CPU profile passed for ${report.target.platform}/${report.target.arch}\n`,
  );
  for (const dependency of Object.values(report.dependencies)) {
    process.stdout.write(
      `  ${dependency.id}: ${dependency.baseline} ${dependency.fingerprint}\n`,
    );
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { REPORT_SCHEMA, validateReleaseCpuProfile };
