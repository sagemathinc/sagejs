"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { arch, platform } = require("node:os");
const { basename, join, resolve } = require("node:path");

const {
  NATIVE_MATH_DEPENDENCY_VERSIONS,
  PORTABLE_PROFILE,
  nativeMathBuildProfile,
  validateGmpConfigureObservation,
  validatePortableReleaseCpuProfile,
} = require("./native-math-profile.cjs");
const {
  fflasMathBuildProfile,
  macosDeploymentTarget,
} = require("./darwin-native.cjs");
const {
  SEA_NATIVE_DEPENDENCIES,
  validateNativeDependencyReceipt,
} = require("./native-dependency-receipt.cjs");
const {
  configureOptions: m4riConfigureOptions,
  portableCacheBytes,
} = require("../packages/m4ri/scripts/build-deps.cjs");

const REPORT_SCHEMA = "sagejs.release-cpu-profile-report-v1";
const SOURCE_SHA256 = Object.freeze({
  fflasFfpack: "dafb4c0835824d28e4f823748579be6e4c8889c9570c6ce9cce1e186c3ebbb23",
  ffpoly: "ffbe5c7f7ce077f3fedb530656b0f7ae95268cf23a38c9adfc3f654a65973b13",
  flint: "b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b",
  givaro: "53e9fb290deb0e20799c62d250d65c2226013d60b4cebe6b0b54c73000cb8fff",
  gmp: "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898",
  mpc: "91204cd32f164bd3b7c992d4a6a8ce6519511aadab30f78b6982d0bf8d73e931",
  mpfr: "b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01",
  openblas: "6761af1d9f5d353ab4f0b7497be2643313b36c8f31caec0144bfef198e71e6ab",
  smalljac: "5a145509e491bba19bf73d8104576083286bd35aea2a149c7c516e9ea5ca8ec7",
});

function aggregateDependency(name, sources, version) {
  const selected = sources
    .map((id) => ({
      name: id === "fflasFfpack" ? "fflas-ffpack" : id,
      sha256: SOURCE_SHA256[id],
      version: NATIVE_MATH_DEPENDENCY_VERSIONS[id],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    name,
    sha256: createHash("sha256")
      .update(JSON.stringify(selected)).digest("hex"),
    version,
  };
}

function digest(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function windowsFlintAuthority(root) {
  const manifest = digest(join(root, "packages", "flint", "vcpkg.json"));
  const triplet = digest(join(
    root,
    "packages",
    "flint",
    "scripts",
    "triplets",
    "x64-windows-static-md-release.cmake",
  ));
  return {
    dependency: {
      name: "vcpkg-flint-stack",
      sha256: createHash("sha256")
        .update(JSON.stringify({ manifest, triplet })).digest("hex"),
      version: "vcpkg-manifest",
    },
    manifest,
    triplet,
  };
}

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

function profileSummary(id, filename, profile, receipt) {
  validatePortableReleaseCpuProfile(profile);
  return {
    baseline: profile.cpuPolicy.baseline,
    fingerprint: profile.fingerprint,
    id,
    receipt: basename(filename),
    receiptIdentitySha256: receipt.identitySha256,
    outputIdentitySha256: receipt.outputs.identitySha256,
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
  const baseProfile = nativeMathBuildProfile({
    arch: profiles.flint.abi.arch,
    compiler: profiles.flint.compilers.c,
    cxxCompiler: profiles.flint.compilers.cxx,
    endianness: profiles.flint.abi.endianness,
    environment: {},
    platform: profiles.flint.abi.platform,
    requestedProfile: PORTABLE_PROFILE,
  });
  const expectedProfiles = {
    fflas: target.platform === "darwin"
      ? fflasMathBuildProfile(baseProfile, "darwin")
      : baseProfile,
    flint: baseProfile,
    graph: baseProfile,
    m4ri: baseProfile,
  };
  for (const [id, profile] of Object.entries(profiles)) {
    if (profile.fingerprint !== expectedProfiles[id].fingerprint) {
      throw new Error(`${id} dependency receipt uses the wrong package CPU profile`);
    }
  }
  if (
    JSON.stringify(flint.build?.configuration?.mathBuildProfile) !==
      JSON.stringify(profiles.flint) ||
    JSON.stringify(fflas.build?.configuration?.mathBuildProfile) !==
      JSON.stringify(profiles.fflas)
  ) {
    throw new Error(
      "FLINT/FFLAS build configuration does not use its receipt CPU profile",
    );
  }
  const expectedCapabilities = {
    fflas: target.platform !== "win32",
    flint: true,
    graph: true,
    m4ri: target.platform !== "win32",
  };
  for (const [id, receipt] of Object.entries({ fflas, flint, graph, m4ri })) {
    const expectedPackage = id === "graph" ? "igraph" : id;
    if (
      receipt.package !== expectedPackage ||
      receipt.capability !== expectedCapabilities[id]
    ) {
      throw new Error(`${id} dependency receipt has the wrong package role`);
    }
  }
  const flintSources = ["flint", "gmp", "mpc", "mpfr", "openblas"];
  if (target.platform === "linux" && target.arch === "x64") {
    flintSources.push("ffpoly", "smalljac");
  }
  const windowsAuthority = target.platform === "win32"
    ? windowsFlintAuthority(root)
    : null;
  const exactDependencies = {
    fflas: aggregateDependency(
      "fflas-stack",
      ["fflasFfpack", "givaro", "gmp"],
      NATIVE_MATH_DEPENDENCY_VERSIONS.fflasFfpack,
    ),
    flint: windowsAuthority?.dependency ?? aggregateDependency(
        "flint-stack",
        flintSources,
        NATIVE_MATH_DEPENDENCY_VERSIONS.flint,
      ),
  };
  for (const [id, expected] of Object.entries(exactDependencies)) {
    const actual = id === "flint" ? flint.dependency : fflas.dependency;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${id} dependency receipt does not match source authority`);
    }
  }
  for (const [id, receipt] of Object.entries({
    graph,
    m4ri,
  })) {
    const definition = SEA_NATIVE_DEPENDENCIES[id === "graph" ? "igraph" : id];
    if (
      JSON.stringify(receipt.dependency) !==
        JSON.stringify(definition.dependency) ||
      receipt.interface?.header !== definition.interfaceHeader ||
      receipt.interface?.sha256 !== definition.interfaceSha256 ||
      !receipt.outputs.files.some((file) =>
        file.path === receipt.interface.header &&
        file.type === "file" &&
        file.sha256 === receipt.interface.sha256)
    ) {
      throw new Error(`${id} dependency receipt does not match source authority`);
    }
  }
  const fflasHeaderSha256 = digest(join(
    root,
    "packages",
    "fflas",
    "include",
    "sagejs",
    "fflas_matrix_ffi.h",
  ));
  if (
    fflas.interface?.header !== "include/sagejs/fflas_matrix_ffi.h" ||
    fflas.interface?.sha256 !== fflasHeaderSha256 ||
    !fflas.outputs.files.some((file) =>
      file.path === fflas.interface.header &&
      file.type === "file" &&
      file.sha256 === fflasHeaderSha256)
  ) {
    throw new Error("FFLAS dependency receipt does not match interface authority");
  }
  requireReceiptOutputs(
    "flint",
    flint,
    target.platform === "win32"
      ? ["lib/flint.lib", "lib/openblas.lib"]
      : [
          "lib/libflint.a",
          "lib/libgmp.a",
          "lib/libmpc.a",
          "lib/libmpfr.a",
          "lib/libopenblas.a",
          ...(target.platform === "linux" && target.arch === "x64"
            ? ["lib/libff_poly.a", "lib/libsmalljac.a"]
            : []),
        ],
  );
  requireReceiptOutputs(
    "fflas",
    fflas,
    target.platform === "win32"
      ? ["include/sagejs/fflas_matrix_ffi.h"]
      : [
          "include/sagejs/fflas_matrix_ffi.h",
          "include/fflas-ffpack/fflas-ffpack.h",
          "lib/libgivaro.a",
          "lib/libgmp.a",
          "lib/libgmpxx.a",
          target.platform === "darwin"
            ? "lib/Accelerate.tbd"
            : "lib/libopenblas.a",
        ],
  );
  requireReceiptOutputs(
    "igraph",
    graph,
    target.platform === "win32"
      ? ["include/sagejs/igraph_ffi.h", "lib/igraph.lib"]
      : ["include/sagejs/igraph_ffi.h", "lib/libigraph.a"],
  );
  requireReceiptOutputs(
    "m4ri",
    m4ri,
    target.platform === "win32"
      ? ["include/sagejs/m4ri_matrix_ffi.h"]
      : ["include/sagejs/m4ri_matrix_ffi.h", "lib/libm4ri.a"],
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
      flint.build?.configuration?.windows?.manifestSha256 !==
        windowsAuthority.manifest ||
      flint.build?.configuration?.windows?.tripletSha256 !==
        windowsAuthority.triplet ||
      fflas.capability !== false ||
      graph.capability !== true ||
      m4ri.capability !== false ||
      m4ri.build?.instructionPolicy !== "unavailable" ||
      m4ri.build?.cachePolicy !== "unavailable"
    ) {
      throw new Error("Windows dependency receipts do not implement their portable CPU policy");
    }
  } else {
    if (graph.capability !== true || m4ri.capability !== true) {
      throw new Error("Unix graph and M4RI dependency capabilities are incomplete");
    }
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
      JSON.stringify(m4ri.build?.cachePolicy) !== JSON.stringify({
        kind: "fixed-portable",
        ...portableCacheBytes,
      })
    ) {
      throw new Error("M4RI receipt does not implement its portable CPU policy");
    }
  }
  const expectedGraphBuild = {
    cflags: target.platform === "win32"
      ? []
      : [...profiles.graph.buildOptions.flint.cflags, "-DNDEBUG"],
    cxxflags: target.platform === "win32"
      ? []
      : [...profiles.graph.buildOptions.fflas.cxxflags, "-DNDEBUG"],
    instructionPolicy: profiles.graph.cpuPolicy.baseline,
  };
  if (
    JSON.stringify(graph.build?.cflags) !==
      JSON.stringify(expectedGraphBuild.cflags) ||
    JSON.stringify(graph.build?.cxxflags) !==
      JSON.stringify(expectedGraphBuild.cxxflags) ||
    graph.build?.instructionPolicy !== expectedGraphBuild.instructionPolicy
  ) {
    throw new Error("igraph receipt does not implement its portable CPU profile");
  }
  const expectedM4riBuild = {
    cflags: target.platform === "win32"
      ? []
      : [...profiles.m4ri.buildOptions.flint.cflags, "-std=gnu17"],
    configure: target.platform === "win32"
      ? []
      : m4riConfigureOptions(profiles.m4ri),
  };
  if (
    JSON.stringify(m4ri.build?.cflags) !==
      JSON.stringify(expectedM4riBuild.cflags) ||
    JSON.stringify(m4ri.build?.configure) !==
      JSON.stringify(expectedM4riBuild.configure)
  ) {
    throw new Error("M4RI receipt does not implement its portable CPU profile");
  }
  if (target.platform === "darwin") {
    const expectedDeployment = macosDeploymentTarget(
      options.macosDeploymentTarget === undefined
        ? process.env
        : { MACOSX_DEPLOYMENT_TARGET: options.macosDeploymentTarget },
    );
    for (const [id, receipt] of Object.entries({ fflas, flint, graph, m4ri })) {
      if (receipt.target?.deployment?.macos !== expectedDeployment) {
        throw new Error(`${id} dependency receipt has the wrong macOS deployment target`);
      }
    }
  }
  return {
    dependencies: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => {
      const receipt = { fflas, flint, graph, m4ri }[id];
      return [id, profileSummary(id, filenames[id], profile, receipt)];
    })),
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
