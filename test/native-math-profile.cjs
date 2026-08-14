"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const {
  NATIVE_MATH_DEPENDENCY_VERSIONS,
  CPU_NATIVE_PROFILE,
  PORTABLE_PROFILE,
  deriveNativeMathBuildProfile,
  nativeMathBuildProfile,
  nativeMathBuildProvenance,
  parseGmpConfigureObservation,
  validateGmpConfigureObservation,
  validateNativeMathBuildProfile,
  validatePortableReleaseCpuProfile,
} = require("../scripts/native-math-profile.cjs");
const {
  fflasMathBuildProfile,
} = require("../scripts/darwin-native.cjs");
const {
  nativeArtifactSpecs,
} = require("../scripts/native-worktree-cache.cjs");
const {
  validateReleaseCpuProfile,
} = require("../scripts/release-cpu-profile.cjs");
const {
  SEA_NATIVE_DEPENDENCIES,
  createNativeDependencyReceipt,
  readNativeDependencyReceipt,
  validateNativeDependencyReceipt,
  writeNativeDependencyReceipt,
} = require("../scripts/native-dependency-receipt.cjs");
const {
  receiptExpectation: fflasReceiptExpectation,
  reusableBuildReceipt: reusableFflasBuildReceipt,
} = require("../packages/fflas/scripts/build-deps.cjs");
const {
  openBlasMakeOptions,
  receiptExpectation: flintReceiptExpectation,
  reusableBuildReceipt: reusableFlintBuildReceipt,
  smalljacMakeOptions,
} = require("../packages/flint/scripts/build-deps.cjs");
const {
  configureOptions: m4riConfigureOptions,
  portableCacheBytes,
} = require("../packages/m4ri/scripts/build-deps.cjs");

const compiler = (overrides = {}) => ({
  command: "cc",
  nativeFlag: null,
  nativeFlagSupported: false,
  target: "x86_64-unknown-linux-gnu",
  version: "cc test 1",
  ...overrides,
});

const profile = (overrides = {}) => nativeMathBuildProfile({
  arch: "x64",
  compiler: compiler(),
  cpu: { features: ["avx2", "bmi2"], model: "Test CPU" },
  endianness: "LE",
  environment: {},
  platform: "linux",
  requestedProfile: PORTABLE_PROFILE,
  ...overrides,
});

test("portable math builds remain the default and retain fat GMP", () => {
  const selected = nativeMathBuildProfile({
    arch: "x64",
    compiler: compiler(),
    endianness: "LE",
    environment: {},
    platform: "linux",
  });
  assert.equal(selected.requestedProfile, PORTABLE_PROFILE);
  assert.equal(selected.effectiveProfile, PORTABLE_PROFILE);
  assert.equal(selected.cpu, null);
  assert.ok(selected.buildOptions.gmp.configure.includes("--enable-fat"));
  assert.ok(!selected.buildOptions.flint.cflags.includes("-march=native"));
  assert.deepEqual(
    selected.buildOptions.flint.cflags,
    ["-O3", "-fPIC", "-march=x86-64", "-mtune=generic"],
  );
  assert.equal(selected.cpuPolicy.baseline, "x86-64-v1");
  assert.equal(selected.cpuPolicy.releaseEligible, true);
  assert.equal(
    validatePortableReleaseCpuProfile(selected),
    selected,
  );
  assert.equal(
    selected.fingerprint,
    profile({ cpu: { features: [], model: "Another CPU" } }).fingerprint,
  );
  assert.throws(
    () => nativeMathBuildProfile({ environment: {
      SAGEJS_NATIVE_MATH_PROFILE: "surprise",
    } }),
    /must be portable or cpu-native/,
  );
});

test("cpu-native builds tune GMP and FLINT without uniform fat binaries", () => {
  const selected = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  assert.equal(selected.effectiveProfile, CPU_NATIVE_PROFILE);
  assert.deepEqual(selected.cpu.features, ["avx2", "bmi2"]);
  assert.ok(!selected.buildOptions.gmp.configure.includes("--enable-fat"));
  assert.ok(selected.buildOptions.gmp.cflags.includes("-march=native"));
  assert.ok(selected.buildOptions.flint.cflags.includes("-march=native"));
  assert.equal(selected.buildOptions.flint.fftSmall, "auto-detect");
});

test("native profile fingerprints cover CPU, ABI, compiler, versions, and options", () => {
  const baseline = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  const baselineCompiler = baseline.compilers.c;
  const variants = [
    profile({
      compiler: baselineCompiler,
      cpu: { features: ["avx2"], model: "Different CPU" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      arch: "arm64",
      compiler: {
        ...baselineCompiler,
        nativeFlag: "-mcpu=native",
        target: "aarch64-unknown-linux-gnu",
      },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      compiler: { ...baselineCompiler, version: "cc test 2" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      compiler: baselineCompiler,
      cxxCompiler: { ...baselineCompiler, version: "c++ test 2" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile(),
  ];
  for (const candidate of variants) {
    assert.notEqual(candidate.fingerprint, baseline.fingerprint);
  }
  assert.equal(baseline.dependencies.flint, "3.6.0");
  assert.ok(baseline.buildOptions.gmp.configure.length > 0);
});

test("Windows requests fall back explicitly to the portable profile", () => {
  const selected = profile({
    compiler: compiler(),
    platform: "win32",
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  assert.equal(selected.requestedProfile, CPU_NATIVE_PROFILE);
  assert.equal(selected.effectiveProfile, PORTABLE_PROFILE);
  assert.match(selected.fallbackReason, /win32\/x64/);
  assert.ok(!selected.buildOptions.gmp.configure.includes("--enable-fat"));
  assert.equal(selected.cpuPolicy.baseline, "windows-x64");
  assert.equal(selected.buildOptions.openblas.dynamicArch, false);
  assert.equal(selected.buildOptions.openblas.fallbackTarget, "GENERIC");
});

test("portable policies encode Linux arm64 and Apple Silicon baselines", () => {
  const linuxArm = profile({
    arch: "arm64",
    compiler: { ...compiler(), target: "aarch64-linux-gnu" },
  });
  assert.equal(linuxArm.cpuPolicy.baseline, "armv8-a");
  assert.ok(linuxArm.buildOptions.flint.cflags.includes("-march=armv8-a"));
  assert.equal(linuxArm.buildOptions.openblas.fallbackTarget, "ARMV8");
  validatePortableReleaseCpuProfile(linuxArm);

  const appleArm = profile({
    arch: "arm64",
    compiler: { ...compiler(), target: "arm64-apple-darwin" },
    platform: "darwin",
  });
  assert.equal(appleArm.cpuPolicy.baseline, "apple-silicon-m1");
  assert.deepEqual(appleArm.buildOptions.flint.cflags, ["-O3", "-fPIC"]);
  assert.equal(appleArm.cpuPolicy.targetSelection, "macos-deployment-target");
  validatePortableReleaseCpuProfile(appleArm);
});

test("smalljac sees private dependency headers through explicit and implicit rules", () => {
  const nativePrefix = resolve("/private/native");
  const include = `-I${join(nativePrefix, "include")}`;
  const options = smalljacMakeOptions(nativePrefix, profile().buildOptions);
  assert.ok(options.includes(`CPPFLAGS=${include}`));
  assert.ok(options.includes(`INCLUDES=${include}`));
});

test("Apple Silicon GMP configure selection is captured and gated", () => {
  const appleArm = profile({
    arch: "arm64",
    compiler: { ...compiler(), target: "arm64-apple-darwin" },
    platform: "darwin",
  });
  const observation = parseGmpConfigureObservation(`
CFLAGS=-O3 -fPIC -std=gnu17
path= arm64 generic
CFLAGS='-O3 -fPIC -std=gnu17'
host_cpu='aarch64'
`);
  assert.deepEqual(observation, {
    cflags: ["-O3", "-fPIC", "-std=gnu17"],
    hostCpu: "aarch64",
    mpnPath: ["arm64", "generic"],
  });
  assert.equal(
    validateGmpConfigureObservation(appleArm, observation),
    observation,
  );
  for (const mpnPath of [["arm64", "applem1"], ["arm64", "cora53"]]) {
    assert.throws(
      () => validateGmpConfigureObservation(appleArm, {
        ...observation,
        mpnPath,
      }),
      /host-specific MPN path/,
    );
  }
  assert.throws(
    () => parseGmpConfigureObservation("host_cpu='aarch64'\n"),
    /missing CPU selection evidence/,
  );
});

test("Apple Accelerate profile derivation preserves a valid new fingerprint", () => {
  const appleArm = profile({
    arch: "arm64",
    compiler: { ...compiler(), target: "arm64-apple-darwin" },
    platform: "darwin",
  });
  const fflas = fflasMathBuildProfile(appleArm, "darwin");
  assert.notEqual(fflas.fingerprint, appleArm.fingerprint);
  assert.equal(fflas.buildOptions.openblas, undefined);
  assert.equal(
    fflas.cpuPolicy.dependencyDispatch.openblas,
    "apple-accelerate",
  );
  validateNativeMathBuildProfile(fflas);
  validatePortableReleaseCpuProfile(fflas);
});

test("portable release validation rejects host-tuned or forged profiles", () => {
  const selected = profile();
  for (const mutate of [
    (candidate) => candidate.buildOptions.flint.cflags.push("-march=native"),
    (candidate) => candidate.buildOptions.gmp.cflags = [
      "-O3",
      "-fPIC",
      "-march=haswell",
      "-std=gnu17",
    ],
    (candidate) => candidate.buildOptions.openblas.cflags.push("-mtune=native"),
    (candidate) => candidate.buildOptions.openblas.dynamicList.pop(),
    (candidate) => { candidate.cpuPolicy.releaseEligible = false; },
    (candidate) => { candidate.cpuPolicy.dependencyDispatch.gmp = "compiler-baseline"; },
    (candidate) => { candidate.cpuPolicy.dependencyDispatch.extra = "forged"; },
    (candidate) => { candidate.abi.wordBits = 32; },
    (candidate) => { candidate.abi.endianness = "BE"; },
    (candidate) => candidate.buildOptions.gmp.configure.push("--disable-fat"),
    (candidate) => candidate.buildOptions.gmp.configure.push("--build=haswell-linux"),
    (candidate) => candidate.buildOptions.fflas.gmpConfigure.push("--disable-fat"),
    (candidate) => candidate.buildOptions.flint.configure.push("--host=haswell"),
    (candidate) => candidate.buildOptions.optionalX64Accelerators.cflags.push("-mavx2"),
    (candidate) => candidate.buildOptions.optionalX64Accelerators.cflags.push("-march=haswell"),
    (candidate) => { candidate.dependencies.flint = "99.0"; },
  ]) {
    const forged = deriveNativeMathBuildProfile(selected, mutate);
    assert.throws(
      () => validatePortableReleaseCpuProfile(forged),
      /not release CPU-portable|canonical target policy|dispatch policy|build-host CPU/,
    );
  }
});

test("cpu-native requests fall back when either compiler rejects tuning", () => {
  const selected = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    cxxCompiler: compiler({
      command: "c++",
      nativeFlag: "-march=native",
      nativeFlagSupported: false,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  assert.equal(selected.effectiveProfile, PORTABLE_PROFILE);
  assert.match(selected.fallbackReason, /do not both support/);
  assert.throws(
    () => validatePortableReleaseCpuProfile(selected),
    /not release CPU-portable/,
  );
  validateNativeMathBuildProfile(selected);
});

test("worktree dependency cache keys include the complete math profile", () => {
  const workspace = resolve(__dirname, "..");
  const identity = { native: { toolchain: "test" }, node: { abi: "test" } };
  const portable = profile();
  const native = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  const keys = (mathProfile) => new Map(
    nativeArtifactSpecs(workspace, { identity, mathProfile })
      .map(({ id, key }) => [id, key]),
  );
  const portableKeys = keys(portable);
  const nativeKeys = keys(native);
  assert.notEqual(
    portableKeys.get("flint-dependencies"),
    nativeKeys.get("flint-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("fflas-dependencies"),
    nativeKeys.get("fflas-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("graph-dependencies"),
    nativeKeys.get("graph-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("m4ri-dependencies"),
    nativeKeys.get("m4ri-dependencies"),
  );
});

test("provenance distinguishes installed and selected build fingerprints", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-profile-"));
  const prefix = join(directory, "prefix");
  const selected = profile();
  const stamp = join(prefix, ".sagejs-flint-dependencies.json");
  try {
    mkdirSync(prefix, { recursive: true });
    writeFixtureFile(prefix, "lib/libflint.a");
    writeNativeDependencyReceipt(
      stamp,
      {
        build: { configuration: "test", observed: { flintFftSmall: true } },
        dependency: {
          name: "flint-stack",
          sha256: "a".repeat(64),
          version: "test",
        },
        interface: null,
        mathProfile: selected,
        package: "flint",
        toolchain: { compiler: "test" },
      },
      prefix,
    );
    const matching = nativeMathBuildProvenance(directory, {
      arch: "x64",
      compiler: compiler(),
      endianness: "LE",
      environment: {},
      platform: "linux",
      prefix,
      requestedProfile: PORTABLE_PROFILE,
    });
    assert.equal(matching.installedMatchesSelected, true);
    assert.equal(matching.installed.build.observed.flintFftSmall, true);
    const executable = join(resolve(__dirname, ".."), "bin", "sagejs");
    const cliEnvironment = {
      ...process.env,
      SAGEJS_FLINT_PREFIX: prefix,
      SAGEJS_NATIVE_MATH_PROFILE: PORTABLE_PROFILE,
    };
    const cli = JSON.parse(execFileSync(
      process.execPath,
      [executable, "native", "profile", "--json"],
      { encoding: "utf8", env: cliEnvironment },
    ));
    assert.equal(cli.installed.mathProfile.fingerprint, selected.fingerprint);
    assert.equal(cli.installed.build.observed.flintFftSmall, true);
    const cliHuman = execFileSync(
      process.execPath,
      [executable, "native", "profile"],
      { encoding: "utf8", env: cliEnvironment },
    );
    assert.match(cliHuman, /installed FLINT fft_small: enabled/);
    const changed = nativeMathBuildProvenance(directory, {
      arch: "x64",
      compiler: compiler({ version: "cc test 2" }),
      endianness: "LE",
      environment: {},
      platform: "linux",
      prefix,
      requestedProfile: PORTABLE_PROFILE,
    });
    assert.equal(changed.installedMatchesSelected, false);
    writeFixtureFile(prefix, "lib/libflint.a", "tampered");
    const tampered = nativeMathBuildProvenance(directory, {
      arch: "x64",
      compiler: compiler(),
      endianness: "LE",
      environment: {},
      platform: "linux",
      prefix,
      requestedProfile: PORTABLE_PROFILE,
    });
    assert.equal(tampered.installedMatchesSelected, false);
    assert.match(tampered.installed.error, /invalid or stale/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native profile CLI exposes human and structured provenance", () => {
  const root = resolve(__dirname, "..");
  const executable = join(root, "bin", "sagejs");
  const environment = {
    ...process.env,
    SAGEJS_NATIVE_MATH_PROFILE: PORTABLE_PROFILE,
  };
  const human = execFileSync(
    process.execPath,
    [executable, "native", "profile"],
    {
      cwd: root,
      encoding: "utf8",
      env: environment,
    },
  );
  assert.match(human, /Native mathematics dependency profile/);
  assert.match(human, /requested: portable/);
  const structured = JSON.parse(
    execFileSync(
      process.execPath,
      [executable, "native", "profile", "--json"],
      { cwd: root, encoding: "utf8", env: environment },
    ),
  );
  assert.equal(structured.selected.effectiveProfile, PORTABLE_PROFILE);
  assert.match(structured.selected.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(typeof structured.installedMatchesSelected, "boolean");
});

const receiptCompiler = {
  command: "cc",
  nativeFlag: null,
  nativeFlagSupported: false,
  target: "x86_64-unknown-linux-gnu",
  version: "cc receipt test",
};

function receiptProfile() {
  return nativeMathBuildProfile({
    arch: "x64",
    compiler: receiptCompiler,
    cxxCompiler: { ...receiptCompiler, command: "c++" },
    endianness: "LE",
    environment: {},
    platform: "linux",
  });
}

function receiptExpectation(overrides = {}) {
  return {
    build: {
      cflags: ["-O3", "-fPIC"],
      configure: ["--disable-shared", "--enable-static"],
    },
    dependency: {
      name: "example",
      sha256: "a".repeat(64),
      version: "1.2.3",
    },
    deployment: null,
    interface: { header: "include/example.h", sha256: "b".repeat(64) },
    mathProfile: receiptProfile(),
    package: "example",
    toolchain: { compiler: "cc receipt test" },
    ...overrides,
  };
}

function receiptFixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-dependency-receipt-"));
  const prefix = join(root, "prefix");
  const stamp = join(prefix, ".sagejs-example-dependencies.json");
  mkdirSync(join(prefix, "include"), { recursive: true });
  mkdirSync(join(prefix, "lib"), { recursive: true });
  writeFileSync(join(prefix, "include", "example.h"), "header\n");
  writeFileSync(join(prefix, "lib", "libexample.a"), "archive\n");
  return { prefix, root, stamp };
}

test("dependency receipts bind declarations and every installed output byte", () => {
  const item = receiptFixture();
  try {
    const written = writeNativeDependencyReceipt(
      item.stamp,
      receiptExpectation(),
      item.prefix,
    );
    assert.match(written.identitySha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      written.outputs.files.map(({ path }) => path),
      ["include/example.h", "lib/libexample.a"],
    );
    assert.deepEqual(
      readNativeDependencyReceipt(item.stamp, {
        expectation: receiptExpectation(),
        prefix: item.prefix,
      }),
      written,
    );

    writeFileSync(join(item.prefix, "lib", "libexample.a"), "tampered\n");
    assert.equal(
      readNativeDependencyReceipt(item.stamp, {
        expectation: receiptExpectation(),
        prefix: item.prefix,
      }),
      null,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("receipt validation fails closed on profile, target, flags, and identity drift", () => {
  const item = receiptFixture();
  try {
    const receipt = createNativeDependencyReceipt(
      receiptExpectation(),
      item.prefix,
      item.stamp,
    );
    for (const changed of [
      receiptExpectation({ deployment: { macos: "14.0" } }),
      receiptExpectation({
        build: { cflags: ["-O2"], configure: ["--disable-shared"] },
      }),
      receiptExpectation({
        dependency: {
          name: "example",
          sha256: "c".repeat(64),
          version: "1.2.3",
        },
      }),
    ]) {
      assert.throws(
        () => validateNativeDependencyReceipt(receipt, {
          expectation: changed,
        }),
        /does not match the selected build/,
      );
    }
    const forged = structuredClone(receipt);
    forged.build.cflags = ["-Ofast"];
    assert.throws(
      () => validateNativeDependencyReceipt(forged),
      /receipt identity is invalid/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("output inventories are deterministic and permit only contained symlinks", () => {
  const first = receiptFixture();
  const second = receiptFixture();
  try {
    symlinkSync("../lib/libexample.a", join(first.prefix, "include", "alias.a"));
    symlinkSync("../lib/libexample.a", join(second.prefix, "include", "alias.a"));
    const a = createNativeDependencyReceipt(
      receiptExpectation(),
      first.prefix,
      first.stamp,
    );
    const b = createNativeDependencyReceipt(
      receiptExpectation(),
      second.prefix,
      second.stamp,
    );
    assert.equal(a.identitySha256, b.identitySha256);
    assert.equal(a.outputs.files[0].type, "symlink");
    rmSync(join(second.prefix, "include", "alias.a"));
    symlinkSync("../../outside", join(second.prefix, "include", "alias.a"));
    assert.throws(
      () => createNativeDependencyReceipt(
        receiptExpectation(),
        second.prefix,
        second.stamp,
      ),
      /symlink escapes its prefix/,
    );
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});

test("truncated and noncanonical receipt files are rejected without throwing", () => {
  const item = receiptFixture();
  try {
    writeFileSync(item.stamp, readFileSync(__filename).subarray(0, 20));
    assert.equal(readNativeDependencyReceipt(item.stamp), null);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

function releaseProfile(platform = "linux", arch = "x64") {
  const selectedCompiler = {
    command: "cc",
    nativeFlag: null,
    nativeFlagSupported: false,
    target: `${arch}-test-${platform}`,
    version: "test compiler",
  };
  return nativeMathBuildProfile({
    arch,
    compiler: selectedCompiler,
    cxxCompiler: { ...selectedCompiler, command: "c++" },
    endianness: "LE",
    environment: {},
    platform,
  });
}

function writeFixtureFile(prefix, path, contents = path) {
  const filename = join(prefix, path);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, `${contents}\n`);
}

function rewriteDependencyReceipt(stamp, receipt, prefix) {
  writeNativeDependencyReceipt(
    stamp,
    {
      build: receipt.build,
      capability: receipt.capability,
      dependency: receipt.dependency,
      deployment: receipt.target.deployment,
      interface: receipt.interface,
      mathProfile: receipt.mathProfile,
      package: receipt.package,
      toolchain: receipt.toolchain,
    },
    prefix,
  );
}

function stackReceiptExpectation(id, selected, configuration, observed) {
  const flintSources = [
        ["ffpoly", "ffbe5c7f7ce077f3fedb530656b0f7ae95268cf23a38c9adfc3f654a65973b13"],
        ["flint", "b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b"],
        ["gmp", "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898"],
        ["mpc", "91204cd32f164bd3b7c992d4a6a8ce6519511aadab30f78b6982d0bf8d73e931"],
        ["mpfr", "b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01"],
        ["openblas", "6761af1d9f5d353ab4f0b7497be2643313b36c8f31caec0144bfef198e71e6ab"],
        ["smalljac", "5a145509e491bba19bf73d8104576083286bd35aea2a149c7c516e9ea5ca8ec7"],
      ];
  if (selected.abi.platform !== "linux" || selected.abi.arch !== "x64") {
    flintSources.splice(0, 1);
    flintSources.pop();
  }
  const sources = (id === "flint"
    ? flintSources
    : [
        ["fflas-ffpack", "dafb4c0835824d28e4f823748579be6e4c8889c9570c6ce9cce1e186c3ebbb23"],
        ["givaro", "53e9fb290deb0e20799c62d250d65c2226013d60b4cebe6b0b54c73000cb8fff"],
        ["gmp", "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898"],
      ])
    .map(([name, sha256]) => ({
      name,
      sha256,
      version: NATIVE_MATH_DEPENDENCY_VERSIONS[
        name === "fflas-ffpack" ? "fflasFfpack" : name
      ],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  let dependency = {
    name: `${id}-stack`,
    sha256: createHash("sha256").update(JSON.stringify(sources)).digest("hex"),
    version: id === "flint"
      ? NATIVE_MATH_DEPENDENCY_VERSIONS.flint
      : NATIVE_MATH_DEPENDENCY_VERSIONS.fflasFfpack,
  };
  if (id === "flint" && selected.abi.platform === "win32") {
    const root = resolve(__dirname, "..");
    const manifest = createHash("sha256").update(readFileSync(
      join(root, "packages", "flint", "vcpkg.json"),
    )).digest("hex");
    const triplet = createHash("sha256").update(readFileSync(join(
      root,
      "packages",
      "flint",
      "scripts",
      "triplets",
      "x64-windows-static-md-release.cmake",
    ))).digest("hex");
    dependency = {
      name: "vcpkg-flint-stack",
      sha256: createHash("sha256")
        .update(JSON.stringify({ manifest, triplet })).digest("hex"),
      version: "vcpkg-manifest",
    };
  }
  const fflasHeader = join(
    resolve(__dirname, ".."),
    "packages",
    "fflas",
    "include",
    "sagejs",
    "fflas_matrix_ffi.h",
  );
  return {
    build: { configuration, observed },
    dependency,
    interface: id === "fflas"
      ? {
          header: "include/sagejs/fflas_matrix_ffi.h",
          sha256: createHash("sha256")
            .update(readFileSync(fflasHeader)).digest("hex"),
        }
      : null,
    mathProfile: selected,
    package: id,
    toolchain: { compiler: "test" },
  };
}

function releaseProfileFixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-release-cpu-"));
  const prefixes = Object.fromEntries(
    ["fflas", "flint", "graph", "m4ri"].map((id) => {
      const prefix = join(root, id);
      mkdirSync(prefix, { recursive: true });
      return [id, prefix];
    }),
  );
  const selected = releaseProfile();
  const gmpConfigure = {
    cflags: selected.buildOptions.gmp.cflags,
    hostCpu: "x86_64",
    mpnPath: ["x86_64", "fat", "x86_64", "generic"],
  };
  for (const path of [
    "lib/libff_poly.a",
    "lib/libflint.a",
    "lib/libgmp.a",
    "lib/libmpc.a",
    "lib/libmpfr.a",
    "lib/libopenblas.a",
    "lib/libsmalljac.a",
  ]) {
    writeFixtureFile(prefixes.flint, path);
  }
  for (const path of [
    "include/sagejs/fflas_matrix_ffi.h",
    "include/fflas-ffpack/fflas-ffpack.h",
    "lib/libgivaro.a",
    "lib/libgmp.a",
    "lib/libgmpxx.a",
    "lib/libopenblas.a",
  ]) {
    if (path === "include/sagejs/fflas_matrix_ffi.h") {
      const source = join(
        resolve(__dirname, ".."),
        "packages",
        "fflas",
        "include",
        "sagejs",
        "fflas_matrix_ffi.h",
      );
      mkdirSync(dirname(join(prefixes.fflas, path)), { recursive: true });
      writeFileSync(join(prefixes.fflas, path), readFileSync(source));
    } else {
      writeFixtureFile(prefixes.fflas, path);
    }
  }
  writeNativeDependencyReceipt(
    join(prefixes.flint, ".sagejs-flint-dependencies.json"),
    stackReceiptExpectation(
      "flint",
      selected,
      { mathBuildProfile: selected },
      { gmpConfigure },
    ),
    prefixes.flint,
  );
  writeNativeDependencyReceipt(
    join(prefixes.fflas, ".sagejs-fflas-dependencies.json"),
    stackReceiptExpectation(
      "fflas",
      selected,
      { mathBuildProfile: selected },
      { gmpConfigure },
    ),
    prefixes.fflas,
  );
  for (const id of ["graph", "m4ri"]) {
    const definition = SEA_NATIVE_DEPENDENCIES[id === "graph" ? "igraph" : id];
    const headerSource = join(
      resolve(__dirname, ".."),
      "packages",
      id,
      definition.interfaceHeader,
    );
    for (const path of id === "graph"
      ? [definition.interfaceHeader, "lib/libigraph.a"]
      : [definition.interfaceHeader, "lib/libm4ri.a"]) {
      if (path === definition.interfaceHeader) {
        mkdirSync(dirname(join(prefixes[id], path)), { recursive: true });
        writeFileSync(join(prefixes[id], path), readFileSync(headerSource));
      } else {
        writeFixtureFile(prefixes[id], path);
      }
    }
    const stamp = join(
      prefixes[id],
      id === "graph"
        ? ".sagejs-igraph-1.0.1"
        : ".sagejs-m4ri-dependencies.json",
    );
    writeNativeDependencyReceipt(
      stamp,
      {
        build: id === "m4ri"
          ? {
              cflags: [...selected.buildOptions.flint.cflags, "-std=gnu17"],
              cachePolicy: { kind: "fixed-portable", ...portableCacheBytes },
              configure: m4riConfigureOptions(selected),
              instructionPolicy: selected.cpuPolicy.baseline,
            }
          : {
              cflags: [...selected.buildOptions.flint.cflags, "-DNDEBUG"],
              cxxflags: [...selected.buildOptions.fflas.cxxflags, "-DNDEBUG"],
              instructionPolicy: selected.cpuPolicy.baseline,
            },
        dependency: definition.dependency,
        interface: {
          header: definition.interfaceHeader,
          sha256: definition.interfaceSha256,
        },
        mathProfile: selected,
        package: id === "graph" ? "igraph" : id,
        toolchain: { compiler: "test" },
      },
      prefixes[id],
    );
  }
  return { prefixes, root, selected };
}

function releaseProfileOptions(item, platform = "linux") {
  return {
    ...Object.fromEntries(
      Object.entries(item.prefixes).map(([id, prefix]) => [
        `${id}Prefix`,
        prefix,
      ]),
    ),
    target: { arch: "x64", platform },
  };
}

test("release CPU profile validates every dependency receipt", () => {
  const item = releaseProfileFixture();
  try {
    const report = validateReleaseCpuProfile(releaseProfileOptions(item));
    assert.equal(report.schema, "sagejs.release-cpu-profile-report-v1");
    assert.deepEqual(Object.keys(report.dependencies), [
      "fflas",
      "flint",
      "graph",
      "m4ri",
    ]);
    assert.equal(report.dependencies.flint.baseline, "x86-64-v1");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("release CPU profile authority ignores ambient native tuning requests", () => {
  const item = releaseProfileFixture();
  const previous = process.env.SAGEJS_NATIVE_MATH_PROFILE;
  try {
    process.env.SAGEJS_NATIVE_MATH_PROFILE = CPU_NATIVE_PROFILE;
    const report = validateReleaseCpuProfile(releaseProfileOptions(item));
    assert.equal(report.dependencies.flint.baseline, "x86-64-v1");
  } finally {
    if (previous === undefined) {
      delete process.env.SAGEJS_NATIVE_MATH_PROFILE;
    } else {
      process.env.SAGEJS_NATIVE_MATH_PROFILE = previous;
    }
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("release CPU profile independently validates the FFLAS profile", () => {
  const item = releaseProfileFixture();
  try {
    const stamp = join(
      item.prefixes.fflas,
      ".sagejs-fflas-dependencies.json",
    );
    const receipt = JSON.parse(readFileSync(stamp, "utf8"));
    const alternate = releaseProfile("linux", "arm64");
    receipt.mathProfile = alternate;
    receipt.build.configuration.mathBuildProfile = alternate;
    rewriteDependencyReceipt(stamp, receipt, item.prefixes.fflas);
    assert.throws(
      () => validateReleaseCpuProfile(releaseProfileOptions(item)),
      /FFLAS|fflas dependency receipt uses the wrong package CPU profile/i,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("release CPU profile rejects incomplete and alternate dependency authority", () => {
  for (const mutation of ["missing-output", "alternate-source"]) {
    const item = releaseProfileFixture();
    try {
      const stamp = join(item.prefixes.flint, ".sagejs-flint-dependencies.json");
      const receipt = JSON.parse(readFileSync(stamp, "utf8"));
      if (mutation === "missing-output") {
        rmSync(join(item.prefixes.flint, "lib", "libmpfr.a"));
      } else {
        receipt.dependency.sha256 = "e".repeat(64);
        writeNativeDependencyReceipt(
          stamp,
          {
            build: receipt.build,
            dependency: receipt.dependency,
            interface: receipt.interface,
            mathProfile: receipt.mathProfile,
            package: receipt.package,
            toolchain: receipt.toolchain,
          },
          item.prefixes.flint,
        );
      }
      assert.throws(
        () => validateReleaseCpuProfile(releaseProfileOptions(item)),
        /installed output does not match|source authority|does not bind/,
      );
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  }
});

test("release CPU profile rejects forged package build metadata", () => {
  const mutations = [
    ["flint", (receipt) => {
      receipt.build.configuration.mathBuildProfile = releaseProfile(
        "linux",
        "arm64",
      );
    }],
    ["fflas", (receipt) => {
      receipt.build.configuration.mathBuildProfile = releaseProfile(
        "linux",
        "arm64",
      );
    }],
    ["graph", (receipt) => {
      receipt.build.cflags = ["-O3", "-march=native"];
    }],
    ["graph", (receipt) => {
      receipt.build.cxxflags = ["-O3", "-march=native"];
    }],
    ["m4ri", (receipt) => {
      receipt.build.cflags = ["-O3", "-march=native"];
    }],
    ["m4ri", (receipt) => {
      receipt.build.configure = ["--with-cachesize=host-detected"];
    }],
  ];
  for (const [id, mutate] of mutations) {
    const item = releaseProfileFixture();
    try {
      const stamp = join(
        item.prefixes[id],
        id === "flint"
          ? ".sagejs-flint-dependencies.json"
          : id === "fflas"
            ? ".sagejs-fflas-dependencies.json"
            : id === "graph"
              ? ".sagejs-igraph-1.0.1"
              : ".sagejs-m4ri-dependencies.json",
      );
      const receipt = JSON.parse(readFileSync(stamp, "utf8"));
      mutate(receipt);
      rewriteDependencyReceipt(stamp, receipt, item.prefixes[id]);
      assert.throws(
        () => validateReleaseCpuProfile(releaseProfileOptions(item)),
        /CPU profile|portable CPU profile/,
      );
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  }
});

test("release CPU profile validates explicit Windows fallbacks", () => {
  const item = releaseProfileFixture();
  const selected = releaseProfile("win32", "x64");
  try {
    writeFixtureFile(item.prefixes.flint, "lib/flint.lib");
    writeFixtureFile(item.prefixes.flint, "lib/openblas.lib");
    writeFixtureFile(item.prefixes.graph, "lib/igraph.lib");
    const root = resolve(__dirname, "..");
    const manifestSha256 = createHash("sha256").update(readFileSync(
      join(root, "packages", "flint", "vcpkg.json"),
    )).digest("hex");
    const tripletSha256 = createHash("sha256").update(readFileSync(join(
      root,
      "packages",
      "flint",
      "scripts",
      "triplets",
      "x64-windows-static-md-release.cmake",
    ))).digest("hex");
    writeNativeDependencyReceipt(
      join(item.prefixes.flint, ".sagejs-flint-dependencies.json"),
      stackReceiptExpectation(
        "flint",
        selected,
        {
          mathBuildProfile: selected,
          windows: {
            manifestSha256,
            openblasTarget: "GENERIC",
            triplet: "x64-windows-static-md-release",
            tripletSha256,
          },
        },
        { vcpkgInstalled: true },
      ),
      item.prefixes.flint,
    );
    writeNativeDependencyReceipt(
      join(item.prefixes.fflas, ".sagejs-fflas-dependencies.json"),
      {
        ...stackReceiptExpectation(
          "fflas",
          selected,
          { mathBuildProfile: selected },
          { capability: "unavailable" },
        ),
        capability: false,
      },
      item.prefixes.fflas,
    );
    for (const id of ["graph", "m4ri"]) {
      const definition = SEA_NATIVE_DEPENDENCIES[id === "graph" ? "igraph" : id];
      const stamp = join(
        item.prefixes[id],
        id === "graph"
          ? ".sagejs-igraph-1.0.1"
          : ".sagejs-m4ri-dependencies.json",
      );
      writeNativeDependencyReceipt(
        stamp,
        {
          build: id === "m4ri"
            ? {
                cachePolicy: "unavailable",
                cflags: [],
                configure: [],
                instructionPolicy: "unavailable",
              }
            : {
                cflags: [],
                cxxflags: [],
                instructionPolicy: selected.cpuPolicy.baseline,
              },
          capability: id !== "m4ri",
          dependency: definition.dependency,
          interface: {
            header: definition.interfaceHeader,
            sha256: definition.interfaceSha256,
          },
          mathProfile: selected,
          package: id === "graph" ? "igraph" : id,
          toolchain: { compiler: "test" },
        },
        item.prefixes[id],
      );
    }
    const report = validateReleaseCpuProfile(
      releaseProfileOptions(item, "win32"),
    );
    assert.equal(report.dependencies.flint.baseline, "windows-x64");
    writeFixtureFile(item.prefixes.flint, "lib/openblas.lib", "tampered");
    assert.throws(
      () => validateReleaseCpuProfile(releaseProfileOptions(item, "win32")),
      /installed output does not match its receipt/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("release CPU profile rejects missing observed CPU evidence", () => {
  const item = releaseProfileFixture();
  try {
    const flintStamp = join(
      item.prefixes.flint,
      ".sagejs-flint-dependencies.json",
    );
    writeNativeDependencyReceipt(
      flintStamp,
      stackReceiptExpectation(
        "flint",
        item.selected,
        { mathBuildProfile: item.selected },
        {},
      ),
      item.prefixes.flint,
    );
    assert.throws(
      () => validateReleaseCpuProfile(releaseProfileOptions(item)),
      /CPU selection evidence|CFLAGS/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("OpenBLAS make arguments come from the receipt-bearing profile", () => {
  const x64 = openBlasMakeOptions(releaseProfile("linux", "x64"));
  assert.ok(x64.includes("DYNAMIC_ARCH=1"));
  assert.ok(x64.includes(
    "DYNAMIC_LIST=OPTERON NEHALEM SANDYBRIDGE HASWELL ZEN",
  ));
  assert.ok(x64.includes(
    "CFLAGS=-O3 -fPIC -march=x86-64 -mtune=generic",
  ));

  const appleArm = openBlasMakeOptions(releaseProfile("darwin", "arm64"));
  assert.ok(appleArm.includes("DYNAMIC_ARCH=1"));
  assert.ok(appleArm.includes(
    "DYNAMIC_LIST=CORTEXA53 NEOVERSEN1 VORTEXM4",
  ));
  assert.ok(appleArm.includes("CFLAGS=-O3 -fPIC"));
});

test("FLINT reuse requires a byte-exact dependency receipt", () => {
  const selected = releaseProfile();
  const expected = { mathBuildProfile: selected };
  const observation = {
    cflags: selected.buildOptions.gmp.cflags,
    hostCpu: "x86_64",
    mpnPath: ["x86_64", "fat", "x86_64", "generic"],
  };
  const root = mkdtempSync(join(tmpdir(), "sagejs-flint-receipt-"));
  const stamp = join(root, ".sagejs-flint-dependencies.json");
  try {
    writeFixtureFile(root, "lib/libflint.a");
    writeFixtureFile(root, "lib/libopenblas.a");
    writeNativeDependencyReceipt(
      stamp,
      flintReceiptExpectation(expected, { gmpConfigure: observation }, {
        mathBuildProfile: selected,
        platform: "linux",
      }),
      root,
    );
    assert.equal(reusableFlintBuildReceipt(stamp, expected, root), true);
    writeFixtureFile(root, "lib/libopenblas.a", "tampered");
    assert.equal(reusableFlintBuildReceipt(stamp, expected, root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("FFLAS reuse requires receipted portable GMP configure evidence", () => {
  const selected = releaseProfile("darwin", "arm64");
  const expected = {
    macosDeploymentTarget: "13.0",
    mathBuildProfile: selected,
  };
  const observation = {
    cflags: ["-O3", "-fPIC", "-std=gnu17"],
    hostCpu: "aarch64",
    mpnPath: ["arm64", "generic"],
  };
  const root = mkdtempSync(join(tmpdir(), "sagejs-fflas-receipt-"));
  const stamp = join(root, ".sagejs-fflas-dependencies.json");
  try {
    writeFixtureFile(root, "include/sagejs/fflas_matrix_ffi.h", "header");
    writeFixtureFile(root, "lib/libgivaro.a");
    writeNativeDependencyReceipt(
      stamp,
      fflasReceiptExpectation(expected, { gmpConfigure: observation }, {
        macosDeploymentTarget: "13.0",
        mathBuildProfile: selected,
        platform: "darwin",
      }),
      root,
    );
    assert.equal(reusableFflasBuildReceipt(stamp, expected, root), true);
    writeFixtureFile(root, "lib/libgivaro.a", "tampered");
    assert.equal(reusableFflasBuildReceipt(stamp, expected, root), false);
    writeNativeDependencyReceipt(
      stamp,
      fflasReceiptExpectation(expected, {
        gmpConfigure: {
          ...observation,
          mpnPath: ["arm64", "applem1"],
        },
      }, {
        macosDeploymentTarget: "13.0",
        mathBuildProfile: selected,
        platform: "darwin",
      }),
      root,
    );
    assert.equal(reusableFflasBuildReceipt(stamp, expected, root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dependency receipts reject extra fields and malformed output records", () => {
  const item = receiptFixture();
  try {
    const receipt = createNativeDependencyReceipt(
      receiptExpectation(),
      item.prefix,
      item.stamp,
    );
    const extra = { ...receipt, untrusted: true };
    assert.throws(
      () => validateNativeDependencyReceipt(extra),
      /receipt is invalid/,
    );
    const malformed = structuredClone(receipt);
    malformed.outputs.files[0].path = "../outside";
    malformed.outputs.identitySha256 = createHash("sha256")
      .update(JSON.stringify(malformed.outputs.files))
      .digest("hex");
    const identity = { ...malformed };
    delete identity.identitySha256;
    malformed.identitySha256 = createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex");
    assert.throws(
      () => validateNativeDependencyReceipt(malformed),
      /output receipt is invalid/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
