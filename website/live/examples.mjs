export const EXAMPLES = Object.freeze([
  {
    id: "number-field",
    title: "Number field arithmetic",
    description: "A maximal order, prime decomposition, and the first Dedekind zeta coefficients.",
    source: `R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - x - 1)
O = K.maximal_order()
print(O)
print(O.factor_rational_prime(23))
K.zeta_function().coefficients(80)`,
  },
  {
    id: "elliptic-lseries",
    title: "Elliptic curve L-series",
    description: "Evaluate an elliptic-curve L-series at a batch of complex points.",
    source: `E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
values = L.values([1 + k*I/10 for k in range(30)], digits=6)
list(zip(range(30), values))`,
  },
  {
    id: "complex-plot",
    title: "Complex L-series plot",
    description: "Plot the phase and magnitude of L(E,s); sampling is automatically batched.",
    source: `E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
complex_plot(L, (0, 2), (-4, 4), plot_points=100,
             interpolation='nearest')`,
  },
  {
    id: "exact-matrices",
    title: "Exact matrices",
    description: "Exact integer and rational linear algebra backed by WebAssembly.",
    source: `A = matrix(ZZ, [[2, 4, 6], [1, 3, 5], [7, 11, 13]])
print(A.det())
print(A.hermite_form())
B = matrix(QQ, [[1/2, 1/3], [2/5, 3/7]])
B.inverse()`,
  },
  {
    id: "modular-symbols",
    title: "Modular symbols",
    description: "Compute a weight-two modular-symbol space and its cuspidal subspace.",
    source: `M = ModularSymbols(37, 2)
print(M)
print(M.dimension())
M.cuspidal_subspace()`,
  },
]);
