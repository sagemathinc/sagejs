// Fresh-parent Magma benchmark for a quadratic-character modular-form object.

id := GetEnv("CLASSICAL_CHARACTER_OBJECT_CASE");
started := Cputime();
if id eq "quadratic_bad_12" then
    group := DirichletGroup(12);
    character := group.1; // Conrey number 7.
    space := CuspidalSubspace(ModularForms([character], 3));
    operator := HeckeOperator(space, 2);
elif id eq "quadratic_new_20" then
    group := DirichletGroup(20);
    character := group.2; // Conrey number 9.
    space := NewSubspace(CuspidalSubspace(ModularForms([character], 4)));
    operator := HeckeOperator(space, 3);
else
    error "unknown or unsupported benchmark case";
end if;
milliseconds := 1000 * Cputime(started);
printf "{\"system\":\"Magma\",\"id\":\"%o\",", id;
printf "\"milliseconds\":%o,\"dimension\":%o,", milliseconds, Dimension(space);
printf "\"fingerprint\":%o,\"degree\":%o}\n", Trace(operator), Determinant(operator);
quit;
