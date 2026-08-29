/* Equal-contract Magma oracle for Eichler ideal-class Brandt modules. */

SetColumns(0);

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
maximumRepeatText := GetEnv("BRANDT_IDEAL_MAX_REPEATS");
maximumRepeatCount := maximumRepeatText eq "" select 3200 else
    StringToInteger(maximumRepeatText);
targetText := GetEnv("BRANDT_IDEAL_TARGET_MILLISECONDS");
targetMilliseconds := targetText eq "" select 100 else StringToInteger(targetText);
if repeatCount lt 1 then
    error "BRANDT_IDEAL_REPEATS must be positive";
end if;
if maximumRepeatCount lt repeatCount or targetMilliseconds lt 0 then
    error "BRANDT_IDEAL_MAX_REPEATS must be at least BRANDT_IDEAL_REPEATS";
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
    operatorRepeatCount := repeatCount;
    while true do
        operatorModules := [BrandtModule(D, N : ComputeGrams := true) :
            index in [1..operatorRepeatCount]];
        started := Cputime();
        operators := [HeckeOperator(operatorModules[index], ell) :
            index in [1..operatorRepeatCount]];
        operatorTotal := Cputime(started);
        if 1000 * operatorTotal ge targetMilliseconds then
            break;
        end if;
        if operatorRepeatCount ge maximumRepeatCount then
            error "Magma first-operator aggregate did not reach 100 ms";
        end if;
        operatorRepeatCount := Min(2 * operatorRepeatCount, maximumRepeatCount);
    end while;
    firstOperator := operatorTotal / operatorRepeatCount;
    B := constructionModules[1];
    T := operators[1];
    coefficients := Eltseq(CharacteristicPolynomial(T));
    printf "BRANDT D=%o N=%o ell=%o dimension=%o construction=%o first=%o construction_repeats=%o operator_repeats=%o operator_total=%o count=%o\n",
        D, N, ell, Dimension(B), construction, firstOperator, repeatCount,
        operatorRepeatCount, operatorTotal, #coefficients;
    for index in [1..#coefficients] do
        printf "COEFF D=%o N=%o ell=%o index=%o value=%o\n",
            D, N, ell, index, coefficients[index];
    end for;
end for;

quit;
