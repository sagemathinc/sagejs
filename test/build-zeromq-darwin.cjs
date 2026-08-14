"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROJECT_OPTIONS_SHA256,
  parseVcpkgStatus,
  patchProjectOptionsHash,
  resolvedLinkedPackages,
  selectedBuildEnvironment,
  targetArchitecture,
  tripletContents,
} = require("../scripts/build-zeromq-darwin.cjs");

const RESOLVED_STATUS = `Package: zeromq
Version: 4.3.5
Port-Version: 2
Architecture: arm64-osx
Status: install ok installed

Package: zeromq
Feature: curve
Architecture: arm64-osx

Package: zeromq
Feature: draft
Architecture: arm64-osx

Package: zeromq
Feature: sodium
Architecture: arm64-osx

Package: libsodium
Version: 1.0.20
Port-Version: 3
Architecture: arm64-osx
Status: install ok installed
`;

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

test("the actual vcpkg resolution must match linked source authority", () => {
  assert.equal(parseVcpkgStatus(RESOLVED_STATUS).length, 5);
  assert.deepEqual(resolvedLinkedPackages(RESOLVED_STATUS, "arm64-osx"), [
    {
      features: ["curve", "draft", "sodium"],
      name: "zeromq",
      portVersion: 2,
      version: "4.3.5",
    },
    {
      features: [],
      name: "libsodium",
      portVersion: 3,
      version: "1.0.20",
    },
  ]);
  assert.throws(
    () => resolvedLinkedPackages(
      RESOLVED_STATUS.replace("Version: 1.0.20", "Version: 1.0.19"),
      "arm64-osx",
    ),
    /audited libsodium/,
  );
  assert.throws(
    () => resolvedLinkedPackages(
      RESOLVED_STATUS.replace("Feature: sodium\n", ""),
      "arm64-osx",
    ),
    /audited zeromq/,
  );
});
