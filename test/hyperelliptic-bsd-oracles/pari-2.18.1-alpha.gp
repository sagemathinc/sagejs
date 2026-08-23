\\p 80
x = 'x;

genus2tors(C) =
{
  my(P = hyperellminimalmodel(C));
  my(D = hyperelldisc(P));
  my(g = 0);
  forprime(p = 1, 200,
    if(D % p,
      g = gcd(g, subst(hyperellcharpoly(P * Mod(1,p)), x, 1))));
  g;
}

genus2tamagawa(C) =
{
  vecprod(apply(v -> if(#v[3], vecprod(v[3][2]), 1), genus2red(C)[4]));
}

show(id, N, C) =
{
  my(L = lfungenus2(C));
  my(H = hyperellperiods(C, 2));
  my(T = genus2tors(C));
  my(c = genus2tamagawa(C));
  my(v);
  L[5] = N;
  v = lfun(L, 1);
  print("BEGIN|", id);
  print("period|", H);
  print("torsion_reduction_gcd|", T);
  print("tamagawa_test_helper|", c);
  print("L1|", v);
  print("root_number|", lfunrootres(L)[3]);
  if(v,
    print("quotient|", bestappr(v * T^2 / (H * c))),
    print("L1_derivative|", lfun(L, 1, 1));
    print("L1_second_derivative|", lfun(L, 1, 2)));
  print("END|", id);
}

print("PARI|", version());
show("g2-N169-r0", 169, [x^2+x, x^3+x^2+1]);
show("g2-N196-r0", 196, [x^6+3*x^5+6*x^4+7*x^3+6*x^2+3*x+1, x^2+x]);
show("g2-N249-r0-quarter", 249, [2*x^6+3*x^5+x^4+x^3-x, x^3+1]);
show("g2-N277-r0-nine", 277, [x^5-9*x^4+14*x^3-19*x^2+11*x-6, 1]);
show("g2-N295-r0-49", 295, [x^5+15*x^4+53*x^3-50*x^2-109*x-38, x^2+x+1]);
show("g2-N587-positive-rank", 587, [-x^2-x, x^3+x+1]);

print("BEGIN|g3-period-odd-1");
print("period|", hyperellperiods([x^7+x^6-x^5-2*x^4+x^2+x, x^2+1], 2));
print("END|g3-period-odd-1");
print("BEGIN|g3-period-odd-2");
print("period|", hyperellperiods([x^7-3*x^6+3*x^5-3*x^4+4*x^3-3*x^2+x, x^2], 2));
print("END|g3-period-odd-2");

E11 = ellinit([0,-1,1,-10,-20]);
E33 = ellinit([1,1,0,-11,0]);
print("BEGIN|g3-x0-33");
print("factor_conductors|", [ellglobalred(E11)[1], ellglobalred(E11)[1], ellglobalred(E33)[1]]);
print("factor_root_numbers|", [lfunrootres(E11)[3], lfunrootres(E11)[3], lfunrootres(E33)[3]]);
print("factor_L1|", [lfun(E11,1), lfun(E11,1), lfun(E33,1)]);
print("L1|", lfun(E11,1)^2 * lfun(E33,1));
print("factor_L2|", [lfun(E11,2), lfun(E11,2), lfun(E33,2)]);
print("L2|", lfun(E11,2)^2 * lfun(E33,2));
print("conductor|", 11^2 * 33);
print("END|g3-x0-33");
