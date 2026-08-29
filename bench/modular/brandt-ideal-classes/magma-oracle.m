/* Equal-contract Magma oracle for Eichler ideal-class Brandt modules. */

function ParseCases(text)
    answer := [];
    for item in Split(text, ",") do
        fields := Split(item, ":");
        Append(~answer, <StringToInteger(fields[1]), StringToInteger(fields[2]),
            StringToInteger(fields[3])>);
    end for;
    return answer;
end function;

cases := ParseCases(GetEnv("BRANDT_IDEAL_CASES"));
repeatText := GetEnv("BRANDT_IDEAL_REPEATS");
repeatCount := repeatText eq "" select 25 else StringToInteger(repeatText);
if repeatCount lt 1 then
    error "BRANDT_IDEAL_REPEATS must be positive";
end if;
for item in cases do
    D := item[1];
    N := item[2];
    ell := item[3];
    started := Cputime();
    constructionModules := [BrandtModule(D, N : ComputeGrams := true) :
        index in [1..repeatCount]];
    construction := Cputime(started) / repeatCount;

    // Every operator is evaluated on a distinct module which has never
    // computed this Hecke operator.  Time the aggregate so a sub-resolution
    // individual call cannot be reported as zero.
    operatorModules := [BrandtModule(D, N : ComputeGrams := true) :
        index in [1..repeatCount]];
    started := Cputime();
    operators := [HeckeOperator(operatorModules[index], ell) :
        index in [1..repeatCount]];
    operatorTotal := Cputime(started);
    firstOperator := operatorTotal / repeatCount;
    B := constructionModules[1];
    T := operators[1];
    coefficients := Eltseq(CharacteristicPolynomial(T));
    printf "BRANDT D=%o N=%o ell=%o dimension=%o construction=%o first=%o construction_repeats=%o operator_repeats=%o operator_total=%o count=%o\n",
        D, N, ell, Dimension(B), construction, firstOperator, repeatCount,
        repeatCount, operatorTotal, #coefficients;
    for index in [1..#coefficients] do
        printf "COEFF D=%o N=%o ell=%o index=%o value=%o\n",
            D, N, ell, index, coefficients[index];
    end for;
end for;

quit;
