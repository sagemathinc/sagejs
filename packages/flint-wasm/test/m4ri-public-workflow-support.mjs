import assert from "node:assert/strict";

export const publicSource = `
F = GF(2)
A = matrix(F, 4, 5, [
    1,0,1,1,0,
    0,1,1,0,1,
    1,1,0,1,1,
    0,0,1,1,1,
])
B = matrix(F, 5, 3, [
    1,0,1,
    0,1,1,
    1,1,0,
    1,0,0,
    0,1,0,
])
rank = A.rank()
C = A * B
K = A.right_kernel_matrix()
Q = matrix(F, 3, 3, [1,1,0, 0,1,1, 1,1,1])
rhs = matrix(F, 3, 1, [1,0,1])
X = Q.solve_right(rhs)
print(rank)
print(C.str().replace("\n", ";"))
print(K.nrows(), K.ncols(), (A * K.transpose()).is_zero())
print(X.str().replace("\n", ";"), Q * X == rhs)
print(all(value._has_m4ri_matrix_resource() for value in [A,B,C,K,Q,rhs,X]))
print(all(not hasattr(value, "_prime_residues_cache") for value in [A,B,C,K,Q,rhs,X]))
`;

export const expectedStdout = [
  "3",
  "[1 1 1];[1 1 1];[0 0 0];[0 0 0]",
  "2 5 True",
  "[1];[0];[0] True",
  "True",
  "True",
  "",
].join("\n");

const requiredOperations = [
  "matrix_mul",
  "matrix_rank",
  "matrix_right_kernel",
  "matrix_solve",
];

export function requiredRouteIds() {
  return requiredOperations.map((operation) => `ffi:m4ri:${operation}`);
}

export function assertReceiptBackedOperations(instrumentation) {
  assert.ok(instrumentation);
  const routes = new Map(
    instrumentation.routes.map((route) => [route.capability_id, route]),
  );
  for (const id of requiredRouteIds()) {
    assert.deepEqual(
      {
        selected_route: routes.get(id)?.selected_route,
        execution_target: routes.get(id)?.execution_target,
        observed: (routes.get(id)?.call_count ?? 0) >= 1,
      },
      {
        selected_route: "receipt-backed-wasm-artifact",
        execution_target: "wasm-artifact",
        observed: true,
      },
      `${id} must be observed through the production M4RI artifact`,
    );
  }
  assert.equal(
    instrumentation.routes.some((route) =>
      route.capability_id.startsWith("ffi:m4ri:") &&
      route.selected_route !== "receipt-backed-wasm-artifact"
    ),
    false,
  );
}
