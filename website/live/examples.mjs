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
complex_plot(L, (0, 2), (-4, 4), plot_points=50,
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
    id: "numpy-signal-recovery",
    title: "NumPy spectral signal recovery",
    description: "Recover two noisy frequencies with vectorized arrays, a real FFT, and a least-squares linear solve.",
    source: `import numpy as np

np.random.seed(2026)
n = 256
t = np.linspace(0.0, 1.0, n, endpoint=False)

# A noisy signal with frequencies 7 Hz and 19 Hz.
wave7 = np.sin(np.multiply(t, 43.982297150257104))
wave19 = np.cos(np.multiply(t, 119.38052083641213))
clean = np.add(np.multiply(wave7, 1.7), np.multiply(wave19, 0.9))
noisy = np.add(clean, np.random.normal(0.0, 0.35, size=n))

# Find its two dominant frequencies with a real FFT.
spectrum = np.fft.rfft(noisy)
power = np.abs(spectrum)
peak_bins = np.argsort(power)[-2:].tolist()
print("dominant frequency bins:", peak_bins)

# Recover all sine/cosine coefficients by solving the normal equations.
basis = np.column_stack((
    wave7, np.cos(np.multiply(t, 43.982297150257104)),
    np.sin(np.multiply(t, 119.38052083641213)), wave19,
))
normal_matrix = np.matmul(basis.T, basis)
normal_rhs = np.matmul(basis.T, noisy)
coefficients = np.linalg.solve(normal_matrix, normal_rhs)
fit = np.matmul(basis, coefficients)
residual = np.subtract(fit, clean)
rmse = np.sqrt(np.mean(np.multiply(residual, residual))).item()

print("recovered coefficients:", np.round(coefficients, 3).tolist())
print("fit RMSE:", round(rmse, 6))`,
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
  {
    id: "python-language",
    title: "Python · NumPy arrays",
    description: "Run ordinary Python syntax and the browser-native NumPy compatibility layer.",
    source: `%%python
import numpy as np
A = np.array([[1, 2], [3, 4]])
(A.shape, A.sum(), A @ A)`,
  },
  {
    id: "magma-language",
    title: "Magma · factorization",
    description: "Translate a useful subset of Magma syntax locally into Sage.js.",
    source: `%%magma
n := 2026;
Factorization(n);
IsPrime(101);`,
  },
  {
    id: "mathematica-language",
    title: "Mathematica · tables and primes",
    description: "Use the experimental Wolfram Language / Mathematica parser.",
    source: `%%mathematica
f[x_] := x^2 + 1;
Table[f[n], {n, 1, 5}]
FactorInteger[2025]
PrimePi[100]`,
  },
  {
    id: "matlab-language",
    title: "MATLAB · matrix arithmetic",
    description: "Parse MATLAB matrix literals, powers, indexing, and functions.",
    source: `%%matlab
A = [1 2; 3 4];
A^2
x = 1:2:7;
sum(x)`,
  },
  {
    id: "maple-language",
    title: "Maple · sequences",
    description: "Parse Maple assignments, procedures, ranges, and library calls.",
    source: `%%maple
f := x -> x^2 + 1:
seq(f(n), n=1..5);
ithprime(10);`,
  },
  {
    id: "macaulay2-language",
    title: "Macaulay2 · arithmetic",
    description: "Parse and locally execute a Macaulay2 arithmetic expression.",
    source: `%%macaulay2
factor 2026`,
  },
  {
    id: "random-graph-plot",
    title: "Random graph",
    description: "Generate and plot an Erdős–Rényi random graph.",
    source: `set_random_seed(0)
g = graphs.RandomGNP(30, .1)
g
g.plot()`,
  },
  {
    id: "graph-automorphisms",
    title: "Graph automorphisms",
    description: "Compute the automorphism group of a random graph.",
    source: `set_random_seed(0)
g = graphs.RandomGNP(20, .2)
g
g.automorphism_group()`,
  },
]);
