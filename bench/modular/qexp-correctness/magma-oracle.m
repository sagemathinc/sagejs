// Independent Magma oracle for the pinned rational q-expansion corpus.

SetColumns(0);

function MatrixEncoding(value)
    result := "";
    for row_index in [1..Nrows(value)] do
        if row_index gt 1 then
            result := result cat ";";
        end if;
        for column_index in [1..Ncols(value)] do
            if column_index gt 1 then
                result := result cat ",";
            end if;
            result := result cat Sprint(value[row_index, column_index]);
        end for;
    end for;
    return result;
end function;

procedure PrintMatrix(case_id, label, value)
    printf "SAGEJS_QEXP_MAGMA|%o|%o|%o|%o\n",
        case_id, label, Nrows(value), Ncols(value);
    print MatrixEncoding(value);
end procedure;

procedure PrintCuspCase(case_id, level, weight, precision)
    space := CuspForms(level, weight);
    expansions := qExpansionBasis(space, precision);
    rows := [
        [Coefficient(form, exponent) : exponent in [0..precision - 1]]
        : form in expansions
    ];
    if #rows eq 0 then
        value := ZeroMatrix(Rationals(), 0, precision);
    else
        value := EchelonForm(Matrix(Rationals(), rows));
    end if;
    printf "SAGEJS_QEXP_MAGMA_CASE|%o|%o|%o|%o|%o\n",
        case_id, level, weight, precision, Dimension(space);
    PrintMatrix(case_id, "ambient_rref", value);
end procedure;

procedure PrintOldNewCase(case_id, level, weight, precision)
    cuspidal := CuspidalSubspace(ModularSymbols(level, weight, 1));
    new_space := NewSubspace(cuspidal);
    ambient_forms := qExpansionBasis(cuspidal, precision);
    new_forms := qExpansionBasis(new_space, precision);
    ambient_rows := [
        [Coefficient(form, exponent) : exponent in [0..precision - 1]]
        : form in ambient_forms
    ];
    new_rows := [
        [Coefficient(form, exponent) : exponent in [0..precision - 1]]
        : form in new_forms
    ];
    old_rows := [];
    for prime in PrimeDivisors(level) do
        lower := CuspidalSubspace(ModularSymbols(level div prime, weight, 1));
        for form in qExpansionBasis(lower, precision) do
            for factor in [1, prime] do
                Append(~old_rows, [
                    exponent mod factor eq 0
                        select Coefficient(form, exponent div factor)
                        else 0
                    : exponent in [0..precision - 1]
                ]);
            end for;
        end for;
    end for;
    ambient := #ambient_rows eq 0
        select ZeroMatrix(Rationals(), 0, precision)
        else EchelonForm(Matrix(Rationals(), ambient_rows));
    old := #old_rows eq 0
        select ZeroMatrix(Rationals(), 0, precision)
        else BasisMatrix(RowSpace(Matrix(Rationals(), old_rows)));
    new := #new_rows eq 0
        select ZeroMatrix(Rationals(), 0, precision)
        else EchelonForm(Matrix(Rationals(), new_rows));
    printf "SAGEJS_QEXP_MAGMA_OLDNEW|%o|%o|%o|%o|%o|%o|%o\n",
        case_id, level, weight, precision, Nrows(ambient), Nrows(old), Nrows(new);
    PrintMatrix(case_id, "ambient_rref", ambient);
    PrintMatrix(case_id, "old_rref", old);
    PrintMatrix(case_id, "new_rref", new);
    for index in [2, 3] do
        polynomial := CharacteristicPolynomial(HeckeOperator(cuspidal, index));
        printf "SAGEJS_QEXP_MAGMA_HECKE|%o|%o|%o\n",
            case_id, index, polynomial;
    end for;
end procedure;

print "SAGEJS_QEXP_MAGMA_VERSION|", GetVersion();
PrintCuspCase("level1-weight24", 1, 24, 12);
PrintCuspCase("level2-weight12", 2, 12, 12);
PrintCuspCase("level2-weight24-eta-complete", 2, 24, 12);
PrintCuspCase("level6-weight12-eta-complete", 6, 12, 20);
PrintCuspCase("level37-weight2-proper", 37, 2, 12);
PrintCuspCase("level23-weight2-quadratic-newform", 23, 2, 12);
PrintCuspCase("level41-weight2-cubic-newform", 41, 2, 16);

PrintOldNewCase("level37-weight2-prime", 37, 2, 12);
PrintOldNewCase("level121-weight2-prime-square", 121, 2, 25);
PrintOldNewCase("level33-weight2-two-prime", 33, 2, 16);
PrintOldNewCase("level66-weight2-several-degeneracy-sources", 66, 2, 28);
PrintOldNewCase("level22-weight2-bad-prime-separation", 22, 2, 16);

new_space := NewSubspace(CuspForms(23, 2));
for prime in [2, 3, 5, 7, 11, 13] do
    polynomial := CharacteristicPolynomial(HeckeOperator(new_space, prime));
    printf "SAGEJS_QEXP_MAGMA_HECKE|level23-weight2|%o|%o\n", prime, polynomial;
end for;

new_space := NewSubspace(CuspForms(41, 2));
for prime in [2, 3, 5, 7, 11, 13] do
    polynomial := CharacteristicPolynomial(HeckeOperator(new_space, prime));
    printf "SAGEJS_QEXP_MAGMA_HECKE|level41-weight2|%o|%o\n", prime, polynomial;
end for;

quit;
