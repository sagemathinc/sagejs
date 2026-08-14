"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROJECT_OPTIONS_SHA256,
  patchProjectOptionsHash,
  selectedBuildEnvironment,
  targetArchitecture,
  tripletContents,
} = require("../scripts/build-zeromq-darwin.cjs");

test("the vcpkg triplet carries the release floor into static dependencies", () => {
  const arm = tripletContents("arm64", "13.5");
  assert.match(arm, /VCPKG_TARGET_ARCHITECTURE arm64/);
  assert.match(arm, /VCPKG_OSX_ARCHITECTURES arm64/);
  assert.match(arm, /VCPKG_OSX_DEPLOYMENT_TARGET 13\.5/);
  const intel = tripletContents("x64", "13.5");
  assert.match(intel, /VCPKG_OSX_ARCHITECTURES x86_64/);
  assert.equal(targetArchitecture("arm64"), "arm64");
  assert.equal(targetArchitecture("x64"), "x64");
  assert.throws(() => targetArchitecture("ia32"), /unsupported/);
});

test("the upstream project_options fetch is content authenticated", () => {
  const source = [
    "FetchContent_Declare(",
    "  _project_options",
    "  URL https://github.com/aminya/project_options/archive/refs/tags/${PROJECT_OPTIONS_VERSION}.zip",
    ")",
    "",
  ].join("\n");
  assert.match(
    patchProjectOptionsHash(source),
    new RegExp(`URL_HASH SHA256=${PROJECT_OPTIONS_SHA256}`),
  );
  assert.throws(() => patchProjectOptionsHash("changed upstream\n"), /audited/);
});

test("ambient ZeroMQ and vcpkg knobs are replaced by the release contract", () => {
  const selected = selectedBuildEnvironment(
    {
      MACOSX_DEPLOYMENT_TARGET: "15.0",
      VCPKG_OVERLAY_TRIPLETS: "/ambient",
      npm_config_zmq_draft: "false",
    },
    {
      HOME: "/isolated/home",
      SDKROOT: "/sdk",
      VCPKG_DEFAULT_BINARY_CACHE: "/isolated/cache",
      VCPKG_OVERLAY_TRIPLETS: "/isolated/triplets",
      deploymentTarget: "13.5",
    },
  );
  assert.equal(selected.MACOSX_DEPLOYMENT_TARGET, "13.5");
  assert.equal(selected.npm_config_macosx_deployment_target, "13.5");
  assert.equal(selected.npm_config_zmq_draft, "true");
  assert.equal(selected.VCPKG_OVERLAY_TRIPLETS, "/isolated/triplets");
  assert.equal(selected.deploymentTarget, undefined);
});
