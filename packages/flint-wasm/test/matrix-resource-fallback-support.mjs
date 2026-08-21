export const omittedResourceExports = [
  "ffiFmpzMatrixAdd",
  "ffiFmpzMatrixSub",
  "ffiFmpzMatrixNeg",
  "ffiFmpzMatrixScalarMul",
  "ffiFmpzMatrixCharpoly",
  "ffiFmpzMatrixMinpoly",
  "ffiFmpzMatrixHnfTransform",
  "ffiFmpzMatrixSnfTransform",
  "ffiFmpqMatrixAdd",
  "ffiFmpqMatrixSub",
  "ffiFmpqMatrixNeg",
  "ffiFmpqMatrixScalarMul",
  "ffiFmpqMatrixCharpoly",
  "ffiFmpqMatrixMinpoly",
  "ffiFmpqMatrixRightKernel",
];

export const publicSource = `
import sagejs.runtime as rt

backend = rt.flint_backend()
omitted = ${JSON.stringify(omittedResourceExports)}
print(all(rt.reflect.get(backend, name) is rt.undefined for name in omitted))

Z = matrix(ZZ, [[2,4,4],[6,6,12],[10,4,16]])
W = matrix(ZZ, [[0,1,2],[3,4,5],[6,7,8]])
print((Z + W).list())
print((Z - W).list())
print((-Z).list())
print((Z * (2^130 + 3)).list()[0])
print(Z.charpoly(), Z.minpoly())
H, U = Z.hermite_form(transformation=True)
D, L, R = Z.smith_form()
print((U * Z).list() == H.list(), (L * Z * R).list() == D.list())

Q = matrix(QQ, [[1/2,2/3],[3/4,5/6]])
T = matrix(QQ, [[2/5,3/7],[5/11,7/13]])
print((Q + T).list())
print((Q - T).list())
print((-Q).list())
print((Q * (7/5)).list())
print(Q.charpoly(), Q.minpoly())
A = matrix(QQ, [[1/2,1/3,1/5],[1/4,1/7,1/10]])
K = A.right_kernel_matrix()
print(K.dimensions(), (A * K.transpose()).list())
`;

export const expectedStdout = [
  "True",
  "[2, 5, 6, 9, 10, 17, 16, 11, 24]",
  "[2, 3, 2, 3, 2, 7, 4, -3, 8]",
  "[-2, -4, -4, -6, -6, -12, -10, -4, -16]",
  "2722258935367507707706996859454145691654",
  "x^3 - 24*x^2 + 72*x - 48 x^3 - 24*x^2 + 72*x - 48",
  "True True",
  "[9/10, 23/21, 53/44, 107/78]",
  "[1/10, 5/21, 13/44, 23/78]",
  "[-1/2, -2/3, -3/4, -5/6]",
  "[7/10, 14/15, 21/20, 7/6]",
  "x^2 - 4/3*x - 1/12 x^2 - 4/3*x - 1/12",
  "(1, 3) [0, 0]",
  "",
].join("\n");
