// Fresh-parent Magma benchmark for a first cuspidal Hecke matrix.

level := StringToInteger(GetEnv("CLASSICAL_OBJECT_LEVEL"));
weight := StringToInteger(GetEnv("CLASSICAL_OBJECT_WEIGHT"));
index := StringToInteger(GetEnv("CLASSICAL_OBJECT_INDEX"));

started := Cputime();
ambient := ModularForms(Gamma0(level), weight);
space := CuspidalSubspace(ambient);
operator := HeckeOperator(space, index);
milliseconds := 1000 * Cputime(started);

printf "{\"system\":\"Magma\",\"level\":%o,\"weight\":%o,", level, weight;
printf "\"index\":%o,\"milliseconds\":%o,", index, milliseconds;
printf "\"dimension\":%o,\"trace\":%o}\n", Dimension(space), Trace(operator);
quit;
