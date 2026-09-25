// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { inventory, inspectWasm, parseElfInspection } = require("../scripts/release/class-group-artifact-inventory.cjs");

test("engineering inventory extracts actual WebAssembly imports and exports", () => {
  // (module (func (import "env" "f")) (func (export "g")))
  const bytes = Buffer.from(
    "0061736d0100000001040160000002090103656e760166000003020100070501016700010a040102000b",
    "hex",
  );
  assert.deepEqual(inspectWasm(bytes), {
    imports: [{ module: "env", name: "f", kind: "function" }],
    exports: [{ name: "g", kind: "function" }],
  });
});

test("engineering inventory distinguishes dynamic ELF evidence from static closure", () => {
  assert.deepEqual(
    parseElfInspection(
      "  Class:                             ELF64\n  Machine:                           Advanced Micro Devices X86-64\n",
      "      [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]\n",
      " 0x0000000000000001 (NEEDED) Shared library: [libc.so.6]\n" +
        " 0x0000000000000001 (NEEDED) Shared library: [libm.so.6]\n",
    ),
    {
      elfClass: "ELF64",
      machine: "Advanced Micro Devices X86-64",
      interpreter: "/lib64/ld-linux-x86-64.so.2",
      neededSharedLibraries: ["libc.so.6", "libm.so.6"],
    },
  );
});

test("engineering inventory does not claim source-to-artifact or release approval", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-group-inventory-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "empty.wasm");
  fs.writeFileSync(filename, Buffer.from("0061736d01000000", "hex"));
  const report = inventory(["--wasm", filename]);
  assert.match(report.purpose, /not an SBOM or distribution approval/);
  assert.match(report.sourceAssociation, /unverified-local-build/);
  assert.equal(report.artifacts[0].sizeBytes, 8);
  assert.equal(report.artifacts[0].sha256.length, 64);
  assert.ok(report.missingForDistribution.some((item) => item.includes("static Rust")));
});
