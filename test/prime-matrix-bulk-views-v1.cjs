// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-matrix-views-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [sagejs, script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim().split("\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
import sagejs.runtime as runtime

NATIVE_MODE = True


def median_time(function):
    samples = []
    for _repeat in range(5):
        started = runtime.wall_time()
        function()
        samples.append(1000 * (runtime.wall_time() - started))
    samples.sort()
    return samples[len(samples) // 2]


F = GF(7)
values = [(37 * index + 5) % 7 for index in range(12)]
source = matrix(F, 3, 4, values)


def prime_cache(value):
    return runtime.reflect.get(value, "_prime_host_values_cache")


# A singular selector must not decode an entire matrix merely to return one
# fresh vector. It can reuse frozen scalars after a bulk view exists.
selector_only = matrix(F, 3, 4, values)
assert selector_only.row(1).list() == values[4:8]
assert selector_only.column(2).list() == values[2::4]
assert prime_cache(selector_only) is runtime.undefined

assert prime_cache(source) is runtime.undefined
flat = source.list()
host_values = prime_cache(source)
assert host_values is not runtime.undefined
assert [int(value.lift()) for value in flat] == values
assert all(value.parent() is F for value in flat)
try:
    flat[0]._value = 17
    raise AssertionError("prime-field scalar mutation succeeded")
except AttributeError as error:
    assert "immutable" in str(error)
try:
    del flat[0]._value
    raise AssertionError("prime-field scalar deletion succeeded")
except AttributeError as error:
    assert "immutable" in str(error)
assert int(flat[0]) == values[0]

second_flat = source.list()
assert second_flat is not flat
assert all(second_flat[index] is flat[index] for index in range(len(flat)))
assert prime_cache(source) is host_values

rows = source.rows()
columns = source.columns()
assert prime_cache(source) is host_values
assert source.rows() is not rows
assert source.rows(False) is source.rows(False)
assert source.rows()[0] is rows[0]
assert source.columns() is not columns
assert source.columns(False) is source.columns(False)
assert source.columns()[0] is columns[0]
assert all(row.is_immutable() for row in rows)
assert all(column.is_immutable() for column in columns)
for row in range(source.nrows()):
    for column in range(source.ncols()):
        entry = flat[row * source.ncols() + column]
        assert rows[row][column] is entry
        assert columns[column][row] is entry

# Singular selectors remain fresh mutable vectors. Once the scalar host view
# exists, they reuse its immutable entries without aliasing vector storage.
selected_row = source.row(1)
second_row = source.row(1)
selected_column = source.column(2)
assert selected_row is not second_row
assert selected_row.is_mutable() and selected_column.is_mutable()
assert selected_row[0] is rows[1][0]
assert selected_column[0] is columns[2][0]
selected_row[0] = F(6)
selected_column[0] = F(5)
assert rows[1][0] is flat[4]
assert columns[2][0] is flat[2]
assert source[1, 0] == flat[4]
assert source[0, 2] == flat[2]

assert list(source.row(1, from_list=True)) == values[4:8]
assert list(source.column(2, from_list=True)) == values[2::4]
assert prime_cache(source) is host_values

# Failed mutation cannot invalidate a valid presentation cache. Successful
# mutation publishes a new scalar generation while old snapshots stay valid.
cached_rows = source.rows(False)
try:
    source[source.nrows(), 0] = 1
    raise AssertionError("out-of-range mutation succeeded")
except IndexError:
    pass
assert source.rows(False) is cached_rows
old_entry = flat[0]
source[0, 0] = 6
assert source.rows(False) is not cached_rows
assert cached_rows[0][0] is old_entry
assert int(old_entry.lift()) == values[0]
assert prime_cache(source) is not host_values
updated = source.list()
assert int(updated[0].lift()) == 6
assert updated[0] is not old_entry
assert updated[0].parent() is F

# The first bulk orientation controls the cache shape, but the opposite
# orientation must transpose the same scalar references without another decode.
rows_first = matrix(F, 3, 4, values)
assert prime_cache(rows_first) is runtime.undefined
first_rows = rows_first.rows()
rows_first_values = prime_cache(rows_first)
first_columns = rows_first.columns()
assert prime_cache(rows_first) is rows_first_values
assert first_columns[2][1] is first_rows[1][2]

columns_first = matrix(F, 3, 4, values)
assert prime_cache(columns_first) is runtime.undefined
first_columns = columns_first.columns()
columns_first_values = prime_cache(columns_first)
first_rows = columns_first.rows()
assert prime_cache(columns_first) is columns_first_values
assert first_columns[2][1] is first_rows[1][2]

# Empty dimensions retain the Sage-compatible number of empty vectors.
empty_rows = matrix(F, 0, 4)
assert empty_rows.list() == []
assert empty_rows.rows() == []
assert [column.list() for column in empty_rows.columns()] == [[], [], [], []]
empty_columns = matrix(F, 3, 0)
assert empty_columns.list() == []
assert [row.list() for row in empty_columns.rows()] == [[], [], []]
assert empty_columns.columns() == []

# Extension fields and residue rings continue through their generic backends.
K = GF(9, "a")
a = K.gen()
extension = matrix(K, 2, 2, [a, 1, a + 1, 0])
assert extension.list() == [a, K(1), a + 1, K(0)]
assert extension.rows()[1].list() == [a + 1, K(0)]
assert extension.columns()[0].list() == [a, a + 1]
residue_ring = matrix(Zmod(8), 2, 2, [1, 2, 3, 4])
assert residue_ring.list() == [Zmod(8)(1), Zmod(8)(2), Zmod(8)(3), Zmod(8)(4)]

# Warm performance gates are deliberately loose enough for shared CI hosts,
# while retaining a wide margin from the former multi-second coercion loops.
size = 256
list_sources = [random_matrix(F, size) for _ in range(5)]
row_sources = [random_matrix(F, size) for _ in range(5)]
column_sources = [random_matrix(F, size) for _ in range(5)]

list_index = [0]
def first_list():
    list_sources[list_index[0]].list()
    list_index[0] += 1

row_index = [0]
def first_rows():
    row_sources[row_index[0]].rows()
    row_index[0] += 1

column_index = [0]
def first_columns():
    column_sources[column_index[0]].columns()
    column_index[0] += 1

list_ms = median_time(first_list)
rows_ms = median_time(first_rows)
columns_ms = median_time(first_columns)

warm = random_matrix(F, size)
warm.list()
warm_list_ms = median_time(warm.list)

selector = random_matrix(F, 512)
row_ms = median_time(lambda: selector.row(123))
column_ms = median_time(lambda: selector.column(123))
algebra_ms = median_time(lambda: selector + selector)

assert list_ms < 150, list_ms
assert rows_ms < 150, rows_ms
assert columns_ms < 150, columns_ms
assert warm_list_ms < 100, warm_list_ms
assert row_ms < 100, row_ms
assert column_ms < 100, column_ms
assert algebra_ms < (150 if NATIVE_MODE else 1000), algebra_ms

print("PRIME_MATRIX_BULK_VIEWS_OK")
print("list_256_first_ms=" + str(round(list_ms, 3)))
print("rows_256_first_ms=" + str(round(rows_ms, 3)))
print("columns_256_first_ms=" + str(round(columns_ms, 3)))
print("row_512_fresh_ms=" + str(round(row_ms, 3)))
print("column_512_fresh_ms=" + str(round(column_ms, 3)))
print("add_512_ms=" + str(round(algebra_ms, 3)))
`;

test("packed GF(p) matrices have one scalar materialization boundary", () => {
  const source = readFileSync(join(root, "src", "baselib", "matrix.py"), "utf8");
  assert.equal(
    source.match(/runtime\.uint64_residue_elements\(/g)?.length,
    1,
  );
});

for (const environment of [{}, { SAGEJS_NATIVE_DISABLE: "1" }]) {
  test(
    `packed GF(p) matrix host views are bulk (${environment.SAGEJS_NATIVE_DISABLE ? "dynamic" : "native"})`,
    () => {
      const source = environment.SAGEJS_NATIVE_DISABLE
        ? witness.replace("NATIVE_MODE = True", "NATIVE_MODE = False")
        : witness;
      const output = runSage(source, environment);
      assert.ok(output.includes("PRIME_MATRIX_BULK_VIEWS_OK"), output.join("\n"));
      for (const name of [
        "list_256_first_ms",
        "rows_256_first_ms",
        "columns_256_first_ms",
        "row_512_fresh_ms",
        "column_512_fresh_ms",
        "add_512_ms",
      ]) {
        assert.ok(
          output.some((line) =>
            new RegExp(`^${name}=[0-9.]+$`).test(line),
          ),
          output.join("\n"),
        );
      }
    },
  );
}
