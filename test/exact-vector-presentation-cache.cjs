#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-vector-presentation-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const source = String.raw`
exact = __import__(
    'sagejs.linear_algebra.exact_vector_public',
    fromlist=['exact_vector_public'],
)

integer_exports = [0]
rational_exports = [0]
original_integer_values = exact.integer_values
original_rational_values = exact.rational_values

def integer_values(*args):
    integer_exports[0] += 1
    return original_integer_values(*args)

def rational_values(*args):
    rational_exports[0] += 1
    return original_rational_values(*args)

exact.integer_values = integer_values
exact.rational_values = rational_values

def verify_vector(base, values, exports):
    value = vector(base, values)

    # Construction already coerced these values for the resource ingress, so
    # host presentation must not decode the resource a second time.
    first = value.list()
    second = value.list()
    assert exports[0] == 0
    assert first is not second
    assert all(first[index] is second[index] for index in range(len(first)))
    assert value[1] is first[1]

    first[0] = base(101)
    assert value[0] == values[0]

    stable = value.list()
    try:
        value[len(value)] = 7
        raise AssertionError('out-of-range vector mutation succeeded')
    except IndexError:
        pass
    after_failure = value.list()
    assert exports[0] == 0
    assert all(
        stable[index] is after_failure[index] for index in range(len(stable))
    )

    value[0] = base(13)
    updated = value.list()
    assert exports[0] == 1
    assert updated[0] == 13
    assert stable[0] == values[0]
    assert value.list()[0] is updated[0]
    assert exports[0] == 1

    # Arithmetic results have no host snapshot to seed. They materialize once
    # on first presentation, then retain scalar identity behind copied lists.
    result = value + value
    before = exports[0]
    result_first = result.list()
    result_second = result.list()
    assert exports[0] == before + 1
    assert result_first is not result_second
    assert all(
        result_first[index] is result_second[index]
        for index in range(len(result_first))
    )

def verify_matrix(base, values):
    value = matrix(base, 2, 3, values)
    flat = value.list()
    rows = value.rows()
    columns = value.columns()
    assert rows[1][0] is flat[3]
    assert columns[0][1] is flat[3]
    assert rows[0].list()[2] is flat[2]
    assert columns[2].list()[0] is flat[2]

large = 2**521 + 17
verify_vector(ZZ, [large, -2, 3], integer_exports)
verify_vector(QQ, [QQ(large, 19), QQ(-2, 3), QQ(3, 5)], rational_exports)
verify_matrix(ZZ, [1, -2, large, 4, 5, -6])
verify_matrix(
    QQ,
    [QQ(1, 2), QQ(-2, 3), QQ(large, 23), 4, QQ(5, 7), -6],
)

print('exact-vector-presentation-cache-ok')
`;

test("exact vector presentation identity is cached without becoming storage", () => {
  const forbidden = {
    SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
  };
  assert.equal(runSage(source, forbidden), "exact-vector-presentation-cache-ok");
  assert.equal(
    runSage(source, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
    "exact-vector-presentation-cache-ok",
  );
});
