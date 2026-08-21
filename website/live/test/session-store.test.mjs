import assert from "node:assert/strict";
import test from "node:test";
import { decodeSharedSource, encodeSharedSource, newWorkspace, validateWorkspace, WorkspaceStore } from "../session-store.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test("workspace persistence is local, bounded and newest-first", () => {
  const store = new WorkspaceStore(new MemoryStorage());
  const one = store.save(newWorkspace({ title: "One", source: "1 + 1" }));
  const two = store.save(newWorkspace({ title: "Two", source: "2 + 2" }));
  assert.deepEqual(store.list().map((value) => value.id).sort(), [one.id, two.id].sort());
  store.remove(one.id);
  assert.deepEqual(store.list().map((value) => value.id), [two.id]);
});

test("workspace validation rejects unknown formats and oversized source", () => {
  assert.throws(() => validateWorkspace({ schema: "foreign" }), /unsupported/);
  const value = newWorkspace({ source: "12345" });
  assert.throws(() => validateWorkspace(value, { savedSourceBytes: 4 }), /exceeds/);
});

test("share URLs round-trip Unicode source without a network service", () => {
  const source = "R.<π> = PolynomialRing(QQ)\nπ^2 + 1";
  assert.equal(decodeSharedSource(encodeSharedSource(source)), source);
  assert.throws(() => encodeSharedSource("12345", { shareBytes: 4 }), /too large/);
  assert.throws(() => decodeSharedSource("!!"), /malformed/);
});
