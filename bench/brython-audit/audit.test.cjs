// sagejs-test-tier: unit
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const test = require("node:test");
test("upstream fixture bodies retain their exact hashes and corrected big-integer loop", () => {
  const cases = require("./cases.json");
  assert.equal(cases.length, 30);
  assert.equal(new Set(cases.map((c) => c.name)).size, 30);
  for (const c of cases)
    assert.equal(
      crypto.createHash("sha256").update(c.original).digest("hex"),
      c.sha256,
    );
  const big = cases.find((c) => c.name === "big_integers");
  assert.match(big.original, /n = 60/);
  assert.match(big.original, /range\(10000\)/);
  assert.match(
    fs.readFileSync(__dirname + "/BRYTHON-LICENCE.txt", "utf8"),
    /Copyright.*Pierre Quentel/,
  );
});
for (const [filename, count] of [
  ["reconnaissance.json", 30],
  ["full-count.json", 8],
  ["exceptions.json", 4],
  ["exceptions-guarded.json", 4],
]) {
  test(filename + " has complete finite samples with no failed cases", () => {
    const r = require("./evidence/" + filename);
    for (const rows of [
      r.runs.cpython,
      r.runs.brython.data,
      r.runs.sagejsNode,
      r.runs.sagejsBrowser,
    ]) {
      assert.equal(rows.length, count);
      assert.deepEqual(
        rows.map((x) => x.name),
        r.runs.cpython.map((x) => x.name),
      );
      for (const row of rows) {
        assert.equal(row.error, undefined);
        assert.equal(row.seconds.length, 5);
        assert.ok(row.seconds.every((x) => Number.isFinite(x) && x >= 0));
      }
    }
  });
}
