import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectLinkMap, parseLinkMap } from "../scripts/link-map-inventory.mjs";

const header = "    Addr      Off     Size Out     In      Symbol\n";

test("link-map parser includes Rust, C, and internal contributors", () => {
  const map = header + [
    "       -      5c6      13a         /tmp/target/deps/first.o:(symbol)",
    "       -     26889       af         /tmp/target/deps/libserde.rlib(serde.o):(symbol)",
    "       -     26938       ab         /tmp/target/deps/libserde.rlib(serde.o):(other)",
    "       -     2b685       1b         /tmp/sysroot/libc.a(write.c.obj):(write)",
    "       -     2b699        4         <internal>:(synthetic)",
  ].join("\n");
  assert.deepEqual([...parseLinkMap(map)], [
    ["/tmp/target/deps/first.o", 1],
    ["/tmp/target/deps/libserde.rlib(serde.o)", 2],
    ["/tmp/sysroot/libc.a(write.c.obj)", 1],
    ["<internal>", 1],
  ]);
});

test("link-map parser fails closed on unknown input forms", () => {
  assert.throws(() => parseLinkMap("not a map\n"), /unexpected header/);
  assert.throws(() => parseLinkMap(header), /no linked inputs/);
  assert.throws(() => parseLinkMap(
    header + "       -      5c6       10         /tmp/other.so:(symbol)\n",
  ), /unsupported linked input/);
});

test("a map cannot describe a different Wasm artifact", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-iq-link-map-test-"));
  try {
    const candidate = path.join(directory, "candidate.wasm");
    const mapped = path.join(directory, "mapped.wasm");
    fs.writeFileSync(candidate, Buffer.from("0061736d01000000", "hex"));
    fs.writeFileSync(mapped, Buffer.from("0061736d0100000000", "hex"));
    assert.throws(() => inspectLinkMap(candidate, mapped, "missing.map"),
      /not byte-identical Wasm/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a hash-equal map records and confines direct linked objects", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-iq-linked-object-test-"));
  try {
    const target = path.join(directory, "target");
    const sysroot = path.join(directory, "sysroot");
    fs.mkdirSync(target);
    fs.mkdirSync(sysroot);
    const candidate = path.join(directory, "candidate.wasm");
    const mapped = path.join(directory, "mapped.wasm");
    const map = path.join(directory, "link.map");
    const bytes = Buffer.from("0061736d01000000", "hex");
    fs.writeFileSync(candidate, bytes);
    fs.writeFileSync(mapped, bytes);
    const object = path.join(target, "first.o");
    fs.writeFileSync(object, "linked object");
    fs.writeFileSync(map,
      header + `       -      5c6       10         ${object}:(symbol)\n`);
    const report = inspectLinkMap(candidate, mapped, map,
      { targetRoot: target, sysroot });
    assert.equal(report.artifact.bytes, bytes.length);
    assert.equal(report.linkMap.linkedInputCount, 1);
    assert.equal(report.inputs[0].input, "cargo-target/first.o");
    assert.match(report.inputs[0].memberSha256, /^[0-9a-f]{64}$/);

    fs.writeFileSync(`${candidate}.o`, "outside object");
    fs.writeFileSync(map,
      header + `       -      5c6       10         ${candidate}.o:(symbol)\n`);
    assert.throws(() => inspectLinkMap(candidate, mapped, map,
      { targetRoot: target, sysroot }), /outside the build target and Rust sysroot/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
