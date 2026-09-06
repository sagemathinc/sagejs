// Pinned Sage examples plus structural Hecke checks. Shared unchanged between
// Node-Wasm and real browser sessions; none may be accepted as an expected error.
export const characterHeckeCases = [
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
