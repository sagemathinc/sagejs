// Resident Magma timing companion for the pinned Sage.js genus-3 height.
//
// The caller selects either `process-cold` or `resident` by assigning
// SageJSGenus3HeightMode before loading this file.  Resident repetition counts
// may likewise be assigned before `load`.  The completed-square model is the
// exact transport Y = 2*y + 1 used by the checked Magma 2.18-5 oracle.

SetColumns(0);

if not assigned SageJSGenus3HeightMode then
    SageJSGenus3HeightMode := "resident";
end if;
if not assigned SageJSGenus3HeightColdRepetitions then
    SageJSGenus3HeightColdRepetitions := 3;
end if;
if not assigned SageJSGenus3HeightWarmups then
    SageJSGenus3HeightWarmups := 1;
end if;
if not assigned SageJSGenus3HeightWarmRepetitions then
    SageJSGenus3HeightWarmRepetitions := 5;
end if;

SageJSGenus3HeightPrecision := 21;

if SageJSGenus3HeightMode eq "process-cold" then
    started_wall := Realtime();
    started_cpu := Cputime();
    Qx := PolynomialRing(Rationals());
    x := Qx.1;
    f := x^7 - 9*x^6 + 28*x^5 - 32*x^4 + x^3 + 17*x^2 - 6*x;
    F := 1 + 4*f;
    C := HyperellipticCurve(F);
    J := Jacobian(C);
    P := J ! [x*(x - 1)*(x - 2), Qx ! 1];
    height := CanonicalHeight(P : Precision := SageJSGenus3HeightPrecision);
    printf "mode=process-cold\n";
    printf "height=%o\n", height;
    printf "inner_wall_ms=%o\n", 1000*(Realtime() - started_wall);
    printf "inner_cpu_ms=%o\n", 1000*(Cputime() - started_cpu);
    quit;
end if;

if SageJSGenus3HeightMode ne "resident" then
    error "SageJSGenus3HeightMode must be process-cold or resident";
end if;

cold_wall := [];
cold_cpu := [];
cold_height := 0;
for sample in [1..SageJSGenus3HeightColdRepetitions] do
    started_wall := Realtime();
    started_cpu := Cputime();
    cold_Qx := PolynomialRing(Rationals());
    cold_x := cold_Qx.1;
    cold_f := cold_x^7 - 9*cold_x^6 + 28*cold_x^5 - 32*cold_x^4
        + cold_x^3 + 17*cold_x^2 - 6*cold_x;
    cold_C := HyperellipticCurve(1 + 4*cold_f);
    cold_J := Jacobian(cold_C);
    cold_P := cold_J ! [cold_x*(cold_x - 1)*(cold_x - 2), cold_Qx ! 1];
    cold_height := CanonicalHeight(
        cold_P : Precision := SageJSGenus3HeightPrecision
    );
    Append(~cold_cpu, 1000*(Cputime() - started_cpu));
    Append(~cold_wall, 1000*(Realtime() - started_wall));
end for;

Qx := PolynomialRing(Rationals());
x := Qx.1;
f := x^7 - 9*x^6 + 28*x^5 - 32*x^4 + x^3 + 17*x^2 - 6*x;
F := 1 + 4*f;
C := HyperellipticCurve(F);
J := Jacobian(C);
P := J ! [x*(x - 1)*(x - 2), Qx ! 1];
for sample in [1..SageJSGenus3HeightWarmups] do
    warmup_height := CanonicalHeight(
        P : Precision := SageJSGenus3HeightPrecision
    );
end for;

warm_wall := [];
warm_cpu := [];
height := 0;
for sample in [1..SageJSGenus3HeightWarmRepetitions] do
    started_wall := Realtime();
    started_cpu := Cputime();
    height := CanonicalHeight(P : Precision := SageJSGenus3HeightPrecision);
    Append(~warm_cpu, 1000*(Cputime() - started_cpu));
    Append(~warm_wall, 1000*(Realtime() - started_wall));
end for;

height_50 := CanonicalHeight(P : Precision := 50);
major, minor, patch := GetVersion();
printf "mode=resident\n";
printf "magma_version=%o.%o-%o\n", major, minor, patch;
printf "precision_decimal_digits=%o\n", SageJSGenus3HeightPrecision;
printf "cold_repetitions=%o\n", SageJSGenus3HeightColdRepetitions;
printf "warmups=%o\n", SageJSGenus3HeightWarmups;
printf "warm_repetitions=%o\n", SageJSGenus3HeightWarmRepetitions;
printf "object_cold_wall_ms=%o\n", cold_wall;
printf "object_cold_cpu_ms=%o\n", cold_cpu;
printf "warm_wall_ms=%o\n", warm_wall;
printf "warm_cpu_ms=%o\n", warm_cpu;
printf "height=%o\n", height;
printf "height_50=%o\n", height_50;
printf "completed_model=Y^2=1+4*f(x)\n";
printf "completion_map=Y=2*y+1\n";

quit;
