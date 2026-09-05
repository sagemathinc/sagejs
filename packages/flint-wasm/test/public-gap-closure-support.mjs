export const gamma1ModularFormsCase = Object.freeze({
    name: "Gamma1 rational descent with nonreal characters",
    source: [
      "M=ModularForms(Gamma1(7),2,prec=8)",
      "T=M.hecke_matrix(2)",
      "D=M.diamond_bracket_matrix(3)",
      "[M.dimension(), len(M.q_expansion_basis()),",
      " [(c.character().order(),c.field_degree(),c.rational_dimension()) for c in M.character_components()],",
      " T==matrix(QQ,[[-93,0,-168,-840,-1680],[-26,0,-48,-234,-471],[4,1,8,39,76],[6,0,10,55,108],[2,0,5,17,36]]),",
      " T*D==D*T, M.diamond_bracket_matrix(2)*D==M.diamond_bracket_matrix(6),",
      " M.q_expansion_basis_certificate().verify()]",
    ].join("\n"),
    expected: "[5, 5, [(3, 2, 4), (1, 1, 1)], True, True, True, True]",
});

export const publicGapCases = Object.freeze([
  gamma1ModularFormsCase,
  {
    name: "Gamma1 cuspidal newform descent",
    source: [
      "S=ModularForms(Gamma1(13),2,prec=8).cuspidal_subspace()",
      "[S.dimension(), S.q_expansion_basis(), S.hecke_matrix(2),",
      " len(S.newforms()), S.q_expansion_basis_certificate().verify()]",
    ].join("\n"),
    expected: "[2, [q - 4*q^3 - q^4 + 3*q^5 + 6*q^6 + O(q^8), q^2 - 2*q^3 - q^4 + 2*q^5 + 2*q^6 + O(q^8)], [ 0 -3]\n[ 1 -3], 1, True]",
  },
  {
    name: "extension-field polynomial arithmetic",
    source: [
      "K=GF(3^2,'a')",
      "a=K.gen()",
      "R=PolynomialRing(K,'x')",
      "x=R.gen()",
      "f=(x+a)^3*(x^2+a*x+a+1)",
      "q,r=f.quo_rem((x+a)^2)",
      "F=f.factor()",
      "[q*(x+a)^2+r==f,r==0,F.value()==f," +
        "all(g.is_irreducible() for g,e in F)," +
        "((x+a)^3).roots()==[(-a,3)]]",
    ].join("\n"),
    expected: "[True, True, True, True, True]",
  },
  {
    name: "truncated power-series arithmetic",
    source: [
      "S=PowerSeriesRing(QQ,'t',default_prec=8)",
      "t=S.gen()",
      "f=(1+2*t+3*t^2).add_bigoh(8)",
      "g=f.inverse()",
      "[g.padded_list()==[1,-2,1,4,-11,10,13,-56]," +
        "(f*g).padded_list()==[1,0,0,0,0,0,0,0]," +
        "f.valuation()==0,(f^5).precision_absolute()==8," +
        "str(f._inflate(2,8))=='1 + 2*t^2 + 3*t^4 + O(t^8)']",
    ].join("\n"),
    expected: "[True, True, True, True, True]",
  },
  {
    name: "approximate eigensystems",
    source: [
      "A=matrix(CDF,[[1,2],[3,4]])",
      "v=A.eigenvalues()",
      "right=A.eigenvectors_right()",
      "left=A.eigenvectors_left()",
      "[len(v)==2,abs(v[0]+v[1]-5)<1e-12," +
        "abs(v[0]*v[1]+2)<1e-12," +
        "len(right)==2,len(left)==2," +
        "all(item[2]==1 for item in right+left)]",
    ].join("\n"),
    expected: "[True, True, True, True, True, True]",
  },
  {
    name: "exact Dirichlet-character sums",
    source: [
      "G=DirichletGroup(5)",
      "chi=G.0",
      "g=chi.gauss_sum()",
      "[g.minpoly()==polygen(ZZ)^8+30*polygen(ZZ)^4+625," +
        "str(chi.jacobi_sum(chi))=='-2*I - 1'," +
        "str([chi.bernoulli(k) for k in range(4)])==" +
        "'[0, -1/5*I - 3/5, 0, 6/5*I + 12/5]'," +
        "chi.gauss_sum_numerical(100).parent()==ComplexField(100)," +
        "chi.root_number(100).parent()==ComplexField(100)]",
    ].join("\n"),
    expected: "[True, True, True, True, True]",
  },
  {
    name: "higher-weight and character presentations",
    source: [
      "P=ModularSymbols(11,4,sign=1).manin_presentation()",
      "e=DirichletGroup(5).gen()^2",
      "C=ModularSymbols(e,4,sign=1).manin_presentation()",
      "D=ModularSymbols(DirichletGroup(13).gen()^2,2,sign=0).manin_presentation()",
      "PR=P.reduction_matrix()",
      "CR=C.reduction_matrix()",
      "DR=D.reduction_matrix()",
      "[P.dimension(),PR.rank(),C.dimension(),CR.rank()," +
        "D.dimension(),DR.rank()," +
        "matrix(QQ,[PR.rows()[g] for g in P.basis_generators()])==" +
        "identity_matrix(QQ,P.dimension())]",
    ].join("\n"),
    expected: "[4, 4, 2, 2, 4, 4, True]",
  },
  {
    name: "portable matrix helpers",
    source: [
      "rings=[Zmod(12),GF(7^2,'b'),CDF,QQbar]",
      "checks=[]",
      "for K in rings:",
      "    A=matrix(K,[[1,0],[0,1]])",
      "    B=matrix(K,[[0,1],[1,0]])",
      "    checks.append((A-A).is_zero())",
      "    checks.append(A.stack(B).dimensions()==(4,2))",
      "    checks.append(A.augment(B).dimensions()==(2,4))",
      "MS=MatrixSpace(Zmod(12),2,2)",
      "A=MS([1,2,3,4])",
      "checks.append(MS._from_packed_residues(A._packed_residues(1),1)==A)",
      "all(checks)",
    ].join("\n"),
    expected: "True",
  },
]);
