// Pinned Sage examples plus structural Hecke checks. Shared unchanged between
// Node-Wasm and real browser sessions; none may be accepted as an expected error.
export const characterHeckeCases = [
  {
    name: "cyclotomic matrix polynomial evaluation and exact kernel fallback",
    source: `
K = CyclotomicField(5)
z = K.gen()
R = PolynomialRing(K,'x')
x = R.gen()
A = diagonal_matrix(K,[z,z^2])
I = identity_matrix(K,2)
p = (x-z)*(x-z^2)
V = (A-z*I).right_kernel()
[p(A)==zero_matrix(K,2), V.dimension(),
 (A-z*I)*V.basis_matrix().transpose()==zero_matrix(K,2,1)]
`,
    expected: "[True, 1, True]",
  },
  {
    name: "exact cyclotomic factorization, separating shifts and multiplicities",
    source: `
checks = []
for order in [3,4,5,7,8,9,12]:
    K = CyclotomicField(order)
    z = K.gen()
    R = PolynomialRing(K,'x')
    x = R.gen()
    for f in [R(QQ(3)/7), x^2-2, x^4-1, (z/3)*(x-z)^2*(x+1)^3]:
        F = f.factor()
        checks.append(R(F.value())==f)
    F = ((z/3)*(x-z)^2*(x+1)^3).factor()
    checks.append(sorted([e for g,e in F]) == [2,3])
    # SageMath 10.9.post1: sqrt(2) is in K precisely for order 8 here.
    checks.append(sorted([g.degree() for g,e in (x^2-2).factor()]) == ([1,1] if order==8 else [2]))
    checks.append(sorted([g.degree() for g,e in (x^4-1).factor()]) == ([1,1,1,1] if order in [4,8,12] else [1,1,2]))
    try:
        R(0).factor()
        checks.append(False)
    except ArithmeticError:
        checks.append(True)
[len(checks), all(checks)]
`,
    expected: "[56, True]",
  },
  {
    name: "higher-dimensional character decomposition with split and irreducible factors",
    source: `
answers = []
for N,conrey,k in [(13,4,4),(25,4,2),(17,9,4)]:
    chi = [c for c in DirichletGroup(N) if c.conrey_number()==conrey][0]
    S = ModularSymbols(chi,k,sign=1).cuspidal_submodule()
    answers.append([S.dimension(), sorted([A.dimension() for A in S.decomposition()])])
answers
`,
    expected: "[[2, [1, 1]], [2, [2]], [3, [3]]]",
  },
  {
    name: "higher-degree character eigenforms, exact recurrence and serialization",
    source: `
chi = [c for c in DirichletGroup(9) if c.conrey_number()==4][0]
f = CuspForms(chi,4,prec=10).newforms()[0]
g = loads(dumps(f))
epsilon2 = QQbar._from_native(chi(2)._native)
[f.defining_polynomial().degree(), f[4]==f[2]^2-8*epsilon2,
 f[6]==f[2]*f[3], f[9]==f[3]^2, f.certificate().verify(),
 g.q_expansion(10)==f.q_expansion(10)]
`,
    expected: "[2, True, True, True, True, True]",
  },
  {
    name: "cubic eigenpacket over a degree-four cyclotomic field",
    source: `
chi = [c for c in DirichletGroup(17) if c.conrey_number()==9][0]
S = CuspForms(chi,4,prec=8)
f = S.newforms()[0]
epsilon2 = QQbar._from_native(chi(2)._native)
K = S.base_ring()
z = K(chi(3))
R = PolynomialRing(K,'x')
x = R.gen()
# SageMath 10.9.post1, DirichletGroup(17)[2], sign +1 cuspidal symbols.
expected = x^3+(-2*z^3-z^2+1)*x^2+(z^3+11*z^2+z)*x+10*z^2+12*z+10
[S.dimension(), f.defining_polynomial().degree(),
 f[4]==f[2]^2-8*epsilon2, f.certificate().verify(),
 S.hecke_matrix(2).charpoly()==expected]
`,
    expected: "[3, 3, True, True, True]",
  },
  {
    name: "quadratic imprimitive character, bad-prime action and recurrence",
    source: `
chi = [c for c in DirichletGroup(12) if c.conrey_number()==7][0]
S = CuspForms(chi,3,prec=8)
T2 = S.hecke_matrix(2)
T3 = S.hecke_matrix(3)
[S.q_expansion_basis(), T2, S.hecke_matrix(4)==T2*T2,
 S.hecke_matrix(6)==T2*T3, T2*T3==T3*T2]
`,
    expected: "[[q - q^3 - 4*q^4 - 2*q^5 + 4*q^6 + 4*q^7 + O(q^8), q^2 - q^3 - 2*q^4 + q^6 + 4*q^7 + O(q^8)], [ 0 -4]\n[ 1 -2], True, True, True]",
  },
  {
    name: "nonreal character in higher weight",
    source: `
e = list(DirichletGroup(13))[2]
S = ModularSymbols(e,4,sign=1).cuspidal_submodule()
C = S.q_expansion_basis_certificate(8)
[S.q_expansion_basis(8), C.dimension(), C.verify(), C.is_sturm_certified()]
`,
    expected: "[[q + (-zeta6 + 1)*q^3 - 2*zeta6*q^4 + (4*zeta6 - 2)*q^5 + (6*zeta6 - 12)*q^6 + (zeta6 - 2)*q^7 + O(q^8), q^2 + (2*zeta6 - 1)*q^3 + (-zeta6 - 1)*q^4 - 3*zeta6*q^5 + (-4*zeta6 + 4)*q^6 + (7*zeta6 - 7)*q^7 + O(q^8)], 2, True, True]",
  },
  {
    name: "degree-four coefficients and prime-power Hecke relations",
    source: `
chi = [c for c in DirichletGroup(25) if c.conrey_number()==4][0]
M = ModularSymbols(chi,2,sign=1)
T2 = M.hecke_matrix(2)
T3 = M.hecke_matrix(3)
U5 = M.hecke_matrix(5)
z = M.base_ring()(chi(2))
R = PolynomialRing(M.base_ring(),'x')
x = R.gen()
# SageMath 10.9.post1: ModularSymbols(DirichletGroup(25)[2],2,sign=1).
expected_T2 = x^4 + (-2*z-2)*x^3 -3*z*x^2 + (-z^3+10*z^2+10*z-1)*x + 3*z^3-8*z^2+3*z
expected_U5 = x^4 + (-z^3+2*z^2-z-5)*x^3 + (6*z^3-12*z^2+11*z-1)*x^2 + (-5*z^3+10*z^2-35*z+5)*x + 25*z
[M.base_ring().degree(), T2*T3==T3*T2,
 M.hecke_matrix(4)==T2*T2-2*z*identity_matrix(M.base_ring(),M.dimension()),
 M.hecke_matrix(25)==U5*U5, M.hecke_matrix(6)==T2*T3,
 T2.charpoly()==expected_T2, U5.charpoly()==expected_U5]
`,
    expected: "[4, True, True, True, True, True, True]",
  },
];
