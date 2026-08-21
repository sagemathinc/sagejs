SetSeed(1);
SetColumns(1024);
Qx<x> := PolynomialRing(Rationals());
major, minor, patch := GetVersion();
printf "META|%o.%o-%o\n", major, minor, patch;

function JoinValues(values)
  if #values eq 0 then return ""; end if;
  return Join([ Sprint(value) : value in values ], ",");
end function;

for n in [6..10] do
  bounds := AssociativeArray();
  bounds[6] := 5; bounds[7] := 11; bounds[8] := 20; bounds[9] := 47; bounds[10] := 97;
  primes := [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
             53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  f := x^n - x - 1;
  K<a> := NumberField(f);
  O := MaximalOrder(K);
  r1, r2 := Signature(K);
  equation_discriminant := Integers() ! Discriminant(f);
  field_discriminant := Integers() ! Discriminant(O);
  index := Isqrt(Abs(equation_discriminant div field_discriminant));
  printf "FIELD|%o|%o|%o|%o|%o|%o|%o\n", n, r1, r2,
         equation_discriminant, field_discriminant, index, bounds[n];
  for proof in ["GRH", "Full"] do
    Ks<as> := NumberField(f);
    Os := MaximalOrder(Ks);
    started := Cputime();
    C, mC := ClassGroup(Os : Proof := proof);
    U, mU := UnitGroup(Os);
    elapsed := Cputime(started);
    label := proof eq "GRH" select "conditional_grh" else "unconditional";
    printf "MODE|%o|%o|%o|%o|%o|%o|%o|%.30o|%.6o\n", n, label,
           JoinValues(Invariants(C)), #C, JoinValues(Invariants(U)), UnitRank(Ks),
           Invariants(U)[1], Regulator(Os), elapsed;
  end for;
  for p in primes do
    if p gt bounds[n] then continue; end if;
    factors := Factorization(p * O);
    parts := [];
    for pair in factors do
      P := pair[1]; e := pair[2]; value := Integers() ! Norm(P); degree := 0;
      while value gt 1 do
        assert IsDivisibleBy(value, p); value div:= p; degree +:= 1;
      end while;
      Append(~parts, Sprintf("%o,%o", e, degree));
    end for;
    Sort(~parts);
    printf "PRIME|%o|%o|%o\n", n, p, Join(parts, ";");
  end for;
end for;
quit;
