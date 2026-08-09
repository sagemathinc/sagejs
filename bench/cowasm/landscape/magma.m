function Euclid(a, b)
    while b ne 0 do
        c := a mod b;
        a := b;
        b := c;
    end while;
    return a;
end function;

function ExtendedEuclid(a, b)
    prevx := 1;
    x := 0;
    prevy := 0;
    y := 1;
    while b ne 0 do
        q, r := Quotrem(a, b);
        temporary := x;
        x := prevx - q*x;
        prevx := temporary;
        temporary := y;
        y := prevy - q*y;
        prevy := temporary;
        a := b;
        b := r;
    end while;
    return a, prevx, prevy;
end function;

function InverseModLocal(a, modulus)
    if a eq 1 or modulus le 1 then return a mod modulus; end if;
    gcd, coefficient, _ := ExtendedEuclid(a, modulus);
    assert gcd eq 1;
    answer := coefficient mod modulus;
    if answer lt 0 then answer +:= modulus; end if;
    return answer;
end function;

function TrialDivision(value)
    if value le 1 then return value; end if;
    if value mod 2 eq 0 then return 2; end if;
    if value mod 3 eq 0 then return 3; end if;
    if value mod 5 eq 0 then return 5; end if;
    differences := [6, 4, 2, 4, 2, 4, 6, 2];
    divisor := 7;
    index := 1;
    limit := Round(Sqrt(RealField(53)!value));
    while divisor le limit do
        if value mod divisor eq 0 then return divisor; end if;
        divisor +:= differences[(index mod 8) + 1];
        index +:= 1;
    end while;
    return value;
end function;

function Fibonacci(n)
    if n eq 0 or n eq 1 then return 1; end if;
    return Fibonacci(n - 1) + Fibonacci(n - 2);
end function;

function Operation(name)
    if name eq "prime_counting" then
        total := 0;
        for value in [1..100000] do
            if value gt 1 and TrialDivision(value) eq value then total +:= 1; end if;
        end for;
        return Sprint(total);
    elif name eq "gcd_loop" then
        total := 0;
        for index in [0..99999] do total +:= Euclid(92250, 922350 + index); end for;
        return Sprint(total);
    elif name eq "xgcd_loop" then
        total := 0;
        for index in [0..99999] do
            gcd, coefficient, second_coefficient :=
                ExtendedEuclid(92250, 922350 + index);
            total +:= gcd;
        end for;
        return Sprint(total);
    elif name eq "inverse_mod_loop" then
        total := 0;
        for value in [1..99999] do total +:= InverseModLocal(value, 1073741827); end for;
        return Sprint(total);
    elif name eq "sum_stride" then
        total := 0;
        for value in [0..999999 by 3] do total +:= 1; end for;
        return Sprint(total);
    elif name eq "recursive_fibonacci" then
        return Sprint(Fibonacci(30));
    elif name eq "int_to_float" then
        values := [1, 4, 6, 7, 8, 9];
        total := RealField(53)!0;
        for iteration in [1..1000000] do
            for value in values do total +:= RealField(53)!value; end for;
        end for;
        assert total eq RealField(53)!35000000;
        return "ok";
    elif name eq "float_abs" then
        R := RealField(53);
        values := [R!1, R!-1.234567, R!44324, R!23.4, R!-43.44e-4];
        total := R!0;
        for iteration in [1..1000000] do
            for value in values do total +:= Abs(value); end for;
        end for;
        ratio := total / R!44349638911.052574;
        assert ratio ge R!0.999999 and ratio le R!1.000001;
        return "ok";
    elif name eq "int_divmod" then
        values := [1, 1235, 5434, 394879374, -34453];
        total := 0;
        for iteration in [1..1000000] do
            for value in values do
                quotient := Floor(value / 23);
                remainder := value - quotient*23;
                total +:= quotient + remainder;
            end for;
        end for;
        return Sprint(total);
    end if;
    error "unknown landscape operation";
end function;

function EnvironmentInteger(name, fallback)
    value := GetEnv(name);
    if value eq "" then return fallback; end if;
    return StringToInteger(value);
end function;

warmups := EnvironmentInteger("SAGEJS_LANDSCAPE_WARMUPS", 1);
samples := EnvironmentInteger("SAGEJS_LANDSCAPE_SAMPLES", 3);
names := [
    "prime_counting", "gcd_loop", "xgcd_loop", "inverse_mod_loop",
    "sum_stride", "recursive_fibonacci", "int_to_float", "float_abs",
    "int_divmod"
];
selection := GetEnv("SAGEJS_LANDSCAPE_ONLY");
if selection ne "" then names := Split(selection, ","); end if;

print "SAGEJS_COWASM_LANDSCAPE 1";
for kind_index in [1..2] do
    kind := kind_index eq 1 select "WARMUP" else "RESULT";
    count := kind_index eq 1 select warmups else samples;
    if count gt 0 then
        for sample in [0..count - 1] do
            for name in names do
                started := Cputime();
                answer := Operation(name);
                elapsed := Round(Cputime(started) * 1000000000);
                printf "%o\t%o\t%o\t%o\t%o\n", kind, sample, name, elapsed, answer;
            end for;
        end for;
    end if;
end for;
printf "COMPLETE\t%o\t%o\t%o\n", warmups, samples, #names;
quit;
