import assert from "node:assert/strict";

export const routeId = "ffi:flint:fmpz_matrix_right_kernel";

export const publicSource = `
rows = 96
columns = 108
entries = [0 for _ in range(rows * columns)]
for row in range(rows):
    entries[row * columns + row] = 1
    for shift, value in [(1, -2), (7, 3), (19, -1)]:
        column = row + shift
        if column < columns:
            entries[row * columns + column] = value

A = matrix(ZZ, rows, columns, entries, sparse=True)
K = A.right_kernel_matrix()
print(K.nrows(), K.ncols(), A.rank())
print(K._has_fmpz_matrix_resource())
`;

export const expectedStdout = "12 108 96\nTrue\n";

export function assertPublicSparseIntegerReceipt(instrumentation) {
  assert.ok(instrumentation);
  const route = instrumentation.routes.find(
    (candidate) => candidate.capability_id === routeId,
  );
  assert.deepEqual(
    {
      selected_route: route?.selected_route,
      execution_target: route?.execution_target,
      call_count: route?.call_count,
    },
    {
      selected_route: "receipt-backed-wasm-artifact",
      execution_target: "wasm-artifact",
      call_count: 1,
    },
  );
  assert.equal(
    instrumentation.routes.some((candidate) =>
      candidate.capability_id === routeId &&
      candidate.selected_route !== "receipt-backed-wasm-artifact"
    ),
    false,
  );
  assert.ok(
    instrumentation.boundary_crossings <= 6,
    `sparse integer kernel used ${instrumentation.boundary_crossings} crossings`,
  );
  assert.ok(
    instrumentation.copied_bytes <= 1024,
    `sparse integer kernel copied ${instrumentation.copied_bytes} bytes`,
  );
}
