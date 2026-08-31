// Independent Magma oracle for the pinned rational q-expansion corpus.

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

print "SAGEJS_QEXP_MAGMA_VERSION|", GetVersion();
PrintCuspCase("level1-weight24", 1, 24, 12);
PrintCuspCase("level2-weight12", 2, 12, 12);
PrintCuspCase("level2-weight24-proper", 2, 24, 12);
PrintCuspCase("level6-weight12-composite", 6, 12, 20);
PrintCuspCase("level22-weight2-entirely-old", 22, 2, 16);

new_space := NewSubspace(CuspForms(23, 2));
for prime in [2, 3, 5, 7, 11, 13] do
    polynomial := CharacteristicPolynomial(HeckeOperator(new_space, prime));
    printf "SAGEJS_QEXP_MAGMA_HECKE|level23-weight2|%o|%o\n", prime, polynomial;
end for;

quit;
