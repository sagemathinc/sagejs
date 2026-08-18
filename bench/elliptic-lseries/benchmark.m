// Matched Magma baseline for moderate-height elliptic L-series evaluation.

Q := Rationals();
C := ComplexField(30);
curves := [
    <"11a1", [Q|0,-1,1,-10,-20]>,
    <"user-evaluation", [Q|1,2,3,4,999]>
];
points := [C!1+C.1, C!1-C.1, C!1+2*C.1, C!(1/2)+C.1, C!(3/2)-C.1];
samples := 7;

for item in curves do
    label := item[1];
    E := EllipticCurve(item[2]);
    start := Cputime();
    L := LSeries(E : Precision := 30);
    setup := Cputime(start);
    start := Cputime();
    value := Evaluate(L, points[1]);
    cold := Cputime(start);
    repeated := [];
    for sample in [1..samples] do
        start := Cputime();
        ignored := Evaluate(L, points[1]);
        Append(~repeated, Cputime(start));
    end for;
    start := Cputime();
    values := [Evaluate(L, point) : point in points];
    batch := Cputime(start);
    Sort(~repeated);
    printf "%o setup=%o cold=%o repeated_median=%o five_points=%o checksum=%o value=%o\n",
        label, setup, cold, repeated[(samples+1) div 2], batch,
        &+[Abs(z) : z in values], value;
end for;

quit;
