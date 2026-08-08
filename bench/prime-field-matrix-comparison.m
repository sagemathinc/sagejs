// Matched Magma benchmark for Native Kernel v8 prime-field matrices.

sizes := [16, 32, 64, 128, 256];
fields := [
    <"u32", 65521>,
    <"u61", 2305843009213693951>
];

for field_data in fields do
    field_name := field_data[1];
    prime := field_data[2];
    field := GF(prime);
    for size in sizes do
        if size le 16 then
            repetitions := 10000;
        elif size le 32 then
            repetitions := 3000;
        elif size le 64 then
            repetitions := 500;
        elif size le 128 then
            repetitions := 100;
        else
            repetitions := 20;
        end if;
        source_values := [
            (field!(row + column - 1))^-1
            : row, column in [1..size]
        ];
        right_values := [
            field!(row * (column + 1))
            : row in [1..size], column in [1..4]
        ];

        sources := [
            Matrix(field, size, size, source_values)
            : repetition in [1..repetitions]
        ];
        started := Cputime();
        for repetition in [1..repetitions] do
            answer := Rank(sources[repetition]);
        end for;
        elapsed := 1000 * Cputime(started) / repetitions;
        print "RESULT", field_name, size, "rank", RealField(20)!elapsed;

        sources := [
            Matrix(field, size, size, source_values)
            : repetition in [1..repetitions]
        ];
        started := Cputime();
        for repetition in [1..repetitions] do
            answer := Determinant(sources[repetition]);
        end for;
        elapsed := 1000 * Cputime(started) / repetitions;
        print "RESULT", field_name, size, "determinant", RealField(20)!elapsed;

        sources := [
            Matrix(field, size, size, source_values)
            : repetition in [1..repetitions]
        ];
        started := Cputime();
        for repetition in [1..repetitions] do
            answer := EchelonForm(sources[repetition]);
        end for;
        elapsed := 1000 * Cputime(started) / repetitions;
        print "RESULT", field_name, size, "echelon", RealField(20)!elapsed;

        sources := [
            Matrix(field, size, size, source_values)
            : repetition in [1..repetitions]
        ];
        rights := [
            Matrix(field, size, 4, right_values)
            : repetition in [1..repetitions]
        ];
        started := Cputime();
        for repetition in [1..repetitions] do
            answer := Transpose(Solution(
                Transpose(sources[repetition]),
                Transpose(rights[repetition])
            ));
        end for;
        elapsed := 1000 * Cputime(started) / repetitions;
        print "RESULT", field_name, size, "solve-4", RealField(20)!elapsed;
    end for;
end for;

quit;
