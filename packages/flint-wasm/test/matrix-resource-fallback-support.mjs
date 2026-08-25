export const omittedResourceExports = [
  "ffiFmpzMatrixAdd",
  "ffiFmpzMatrixSub",
  "ffiFmpzMatrixNeg",
  "ffiFmpzMatrixScalarMul",
  "ffiFmpzMatrixIsZero",
  "ffiFmpzMatrixCharpoly",
  "ffiFmpzMatrixMinpoly",
  "ffiFmpzMatrixHnfTransform",
  "ffiFmpzMatrixSnfTransform",
  "ffiFmpqMatrixAdd",
  "ffiFmpqMatrixSub",
  "ffiFmpqMatrixNeg",
  "ffiFmpqMatrixCharpoly",
  "ffiFmpqMatrixMinpoly",
  "ffiFmpqMatrixRightKernel",
];

export const requiredResourceExports = [
  "ffiFmpzMatrixAugment",
  "ffiFmpzMatrixExportModUi",
  "ffiFmpzMatrixFromFmpqIntegral",
  "ffiFmpzMatrixIsOne",
  "ffiFmpzMatrixSelectColumns",
  "ffiFmpzMatrixSetBlock",
  "ffiFmpzMatrixStack",
  "ffiFmpzMatrixSubmatrix",
  "ffiFmpzMatrixTrace",
  "ffiFmpqMatrixAugment",
  "ffiFmpqMatrixIsOne",
  "ffiFmpqMatrixNonzeroCount",
  "ffiFmpqMatrixScalarMul",
  "ffiFmpqMatrixSetBlock",
  "ffiFmpqMatrixStack",
  "ffiFmpqMatrixSubmatrix",
];

export const requiredResourceCapabilities = [
  "ffi:flint:fmpz_matrix_augment",
  "ffi:flint:fmpz_matrix_export_mod_ui",
  "ffi:flint:fmpz_matrix_is_one",
  "ffi:flint:fmpz_matrix_select_columns",
  "ffi:flint:fmpz_matrix_set_block",
  "ffi:flint:fmpz_matrix_stack",
  "ffi:flint:fmpz_matrix_submatrix",
  "ffi:flint:fmpz_matrix_trace",
  "ffi:flint:fmpq_matrix_augment",
  "ffi:flint:fmpq_matrix_is_one",
  "ffi:flint:fmpq_matrix_nonzero_count",
  "ffi:flint:fmpq_matrix_scalar_mul",
  "ffi:flint:fmpq_matrix_set_block",
  "ffi:flint:fmpq_matrix_stack",
  "ffi:flint:fmpq_matrix_submatrix",
];

export const publicSource = `
import sagejs.runtime as rt

backend = rt.flint_backend()
omitted = ${JSON.stringify(omittedResourceExports)}
print(all(rt.reflect.get(backend, name) is rt.undefined for name in omitted))
required = ${JSON.stringify(requiredResourceExports)}
print(all(rt.jstype(rt.reflect.get(backend, name)) == 'function' for name in required))

Z = matrix(ZZ, [[2,4,4],[6,6,12],[10,4,16]])
W = matrix(ZZ, [[0,1,2],[3,4,5],[6,7,8]])
print((Z + W).list())
print((Z - W).list())
print((-Z).list())
print((Z * (2^130 + 3)).list()[0])
print(Z.is_zero(), zero_matrix(ZZ, 3, 4).is_zero())
print(Z.charpoly(), Z.minpoly())
H, U = Z.hermite_form(transformation=True)
D, L, R = Z.smith_form()
print((U * Z).list() == H.list(), (L * Z * R).list() == D.list())
print(Z.is_one(), identity_matrix(ZZ, 3).is_one(), Z.trace())
print(Z.matrix_from_columns([2, 0]).list())
print(Z.stack(W).dimensions(), Z.augment(W).dimensions(), Z.submatrix(1, 1, 2, 2).list())
Zblock = zero_matrix(ZZ, 3)
Zblock.set_block(1, 1, matrix(ZZ, [[1,2],[3,4]]))
print(Zblock.list())
print(Z.change_ring(GF(257)).list()[:3])

Q = matrix(QQ, [[1/2,2/3],[3/4,5/6]])
T = matrix(QQ, [[2/5,3/7],[5/11,7/13]])
print((Q + T).list())
print((Q - T).list())
print((-Q).list())
print((Q * (7/5)).list())
print(Q.charpoly(), Q.minpoly())
print(Q.is_one(), identity_matrix(QQ, 2).is_one(), Q.density(), Q.trace())
print((Q / 2).list())
print(Q.stack(T).dimensions(), Q.augment(T).dimensions(), Q.submatrix(0, 1, 2, 1).list())
Qblock = zero_matrix(QQ, 2)
Qblock.set_block(0, 0, Q)
print(Qblock.list())
A = matrix(QQ, [[1/2,1/3,1/5],[1/4,1/7,1/10]])
K = A.right_kernel_matrix()
print(K.dimensions(), (A * K.transpose()).list())

set_random_seed(1)
print(random_matrix(QQ, 30).charpoly().degree())

M = ModularSymbols(389, 2, sign=1)
D = M.decomposition()
print([M.new_submodule() is M, D is M.decomposition(),
       [A.dimension() for A in D], sum(A.dimension() for A in D)])
`;

export const expectedStdout = [
  "True",
  "True",
  "[2, 5, 6, 9, 10, 17, 16, 11, 24]",
  "[2, 3, 2, 3, 2, 7, 4, -3, 8]",
  "[-2, -4, -4, -6, -6, -12, -10, -4, -16]",
  "2722258935367507707706996859454145691654",
  "False True",
  "x^3 - 24*x^2 + 28*x - 48 x^3 - 24*x^2 + 28*x - 48",
  "True True",
  "False True 24",
  "[4, 2, 12, 6, 16, 10]",
  "(6, 3) (3, 6) [6, 12, 4, 16]",
  "[0, 0, 0, 0, 1, 2, 0, 3, 4]",
  "[2, 4, 4]",
  "[9/10, 23/21, 53/44, 107/78]",
  "[1/10, 5/21, 13/44, 23/78]",
  "[-1/2, -2/3, -3/4, -5/6]",
  "[7/10, 14/15, 21/20, 7/6]",
  "x^2 - 4/3*x - 1/12 x^2 - 4/3*x - 1/12",
  "False True 1.0 4/3",
  "[1/4, 1/3, 3/8, 5/12]",
  "(4, 2) (2, 4) [2/3, 5/6]",
  "[1/2, 2/3, 3/4, 5/6]",
  "(1, 3) [0, 0]",
  "30",
  "[True, True, [1, 1, 2, 3, 6, 20], 33]",
  "",
].join("\n");
