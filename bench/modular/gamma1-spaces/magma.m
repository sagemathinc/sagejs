// Matched Magma benchmark for full Gamma_1(N) spaces.

level := StringToInteger(GetEnv("GAMMA1_LEVEL"));
weight_text := GetEnv("GAMMA1_WEIGHT");
weight := weight_text eq "" select 2 else StringToInteger(weight_text);
space := ModularForms(Gamma1(level), weight);
sl2_index := level le 2 select Index(Gamma1(level)) else 2 * Index(Gamma1(level));
precision := Floor(weight * sl2_index / 12) + 2;
started := Cputime();
basis := Basis(space, precision);
basis_ms := 1000 * Cputime(started);
symbols := ModularSymbols(Gamma1(level), weight, 1);
cusp := CuspidalSubspace(symbols);
started := Cputime();
hecke := HeckeOperator(cusp, 2);
hecke_ms := 1000 * Cputime(started);
printf "{\"system\":\"Magma\",\"level\":%o,", level;
printf "\"weight\":%o,\"dimension\":%o,", weight, Dimension(space);
printf "\"cusp_dimension\":%o,\"precision\":%o,", Dimension(cusp), precision;
printf "\"hecke_trace\":\"%o\",\"basis_ms\":%o,", Trace(hecke), basis_ms;
printf "\"hecke_ms\":%o,\"diamond_ms\":null}\n", hecke_ms;
quit;
