"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  WINDOWS_VCPKG_TRIPLET,
  windowsVcpkgAuthority,
} = require("../packages/flint/scripts/windows-vcpkg-authority.cjs");
const { bindingGyp } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");

function directWindowsRelease(relativePath) {
  const gyp = JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  const windows = gyp.targets[0].conditions.find(([condition]) =>
    condition === "OS=='win'"
  )?.[1] || gyp.targets[0];
  return {
    debug: windows.configurations?.Debug,
    release: windows.configurations.Release.msvs_settings,
  };
}

test("Windows dependency authority requires the static Release CRT", () => {
  assert.equal(WINDOWS_VCPKG_TRIPLET, "x64-windows-static-release");
  const triplet = readFileSync(join(
    root,
    "packages",
    "flint",
    "scripts",
    "triplets",
    `${WINDOWS_VCPKG_TRIPLET}.cmake`,
  ), "utf8");
  assert.match(triplet, /set\(VCPKG_CRT_LINKAGE static\)/);
  assert.match(triplet, /set\(VCPKG_LIBRARY_LINKAGE static\)/);
  assert.match(triplet, /set\(VCPKG_BUILD_TYPE release\)/);
  const retiredTriplet = ["x64-windows-static", "md-release.cmake"].join("-");
  assert.equal(existsSync(join(
    root,
    "packages",
    "flint",
    "scripts",
    "triplets",
    retiredTriplet,
  )), false);

  const authority = windowsVcpkgAuthority(join(root, "packages", "flint"));
  assert.equal(authority.buildType, "release");
  assert.equal(authority.crtLinkage, "static");
  assert.equal(authority.libraryLinkage, "static");
  assert.equal(authority.triplet, WINDOWS_VCPKG_TRIPLET);
  for (const field of [
    "manifestSha256",
    "overlayPortsSha256",
    "tripletSha256",
  ]) {
    assert.match(authority[field], /^[0-9a-f]{64}$/);
  }
  assert.doesNotMatch(readFileSync(join(
    root,
    "packages",
    "flint",
    "scripts",
    "vcpkg-ports",
    "flint",
    "portfile.cmake",
  ), "utf8"), /vcpkg_copy_pdbs/);
});

test("every direct Windows addon disables Release debug records and uses /MT", () => {
  for (const relativePath of [
    "packages/flint/binding.gyp",
    "packages/graph/binding.gyp",
    "test/fixtures/native-resource-finalizer/binding.gyp",
  ]) {
    const { debug, release } = directWindowsRelease(relativePath);
    assert.equal(debug, undefined, `${relativePath} must preserve inherited Debug`);
    assert.equal(release.VCCLCompilerTool.RuntimeLibrary, 0, relativePath);
    assert.equal(release.VCCLCompilerTool.DebugInformationFormat, 0, relativePath);
    assert.ok(release.VCCLCompilerTool.AdditionalOptions.includes("/Brepro"));
    assert.equal(release.VCLinkerTool.GenerateDebugInformation, "false");
    assert.ok(release.VCLinkerTool.AdditionalOptions.includes("/Brepro"));
  }
});

test("generated FFI and native kernels retain delay loading with static Release CRT", () => {
  const target = bindingGyp({
    foreignLibraries: [],
    functions: [{ kernelKind: "integer" }],
  }, true, false, "win32").targets[0];
  assert.equal(target.win_delay_load_hook, "true");
  assert.equal(target.configurations.Debug, undefined);
  assert.deepEqual(
    target.configurations.Release.msvs_settings.VCCLCompilerTool,
    { DebugInformationFormat: 0, RuntimeLibrary: 0 },
  );
  assert.deepEqual(
    target.configurations.Release.msvs_settings.VCLinkerTool,
    { GenerateDebugInformation: "false" },
  );
  assert.ok(target.msvs_settings.VCCLCompilerTool.AdditionalOptions
    .includes("/Brepro"));
  assert.ok(target.msvs_settings.VCLinkerTool.AdditionalOptions
    .includes("/Brepro"));
});
