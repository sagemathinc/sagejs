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
for item in cases do
    D := item[1];
    N := item[2];
    ell := item[3];
    started := Cputime();
    B := BrandtModule(D, N : ComputeGrams := true);
    construction := Cputime(started);
    started := Cputime();
    T := HeckeOperator(B, ell);
    firstOperator := Cputime(started);
    coefficients := Eltseq(CharacteristicPolynomial(T));
    printf "BRANDT D=%o N=%o ell=%o dimension=%o construction=%o first=%o count=%o\n",
        D, N, ell, Dimension(B), construction, firstOperator, #coefficients;
    for index in [1..#coefficients] do
        printf "COEFF D=%o N=%o ell=%o index=%o value=%o\n",
            D, N, ell, index, coefficients[index];
    end for;
end for;

quit;
