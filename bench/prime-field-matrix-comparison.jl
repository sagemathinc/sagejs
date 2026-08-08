#!/usr/bin/env julia

using Nemo
using Printf
using Statistics

const SIZES = [16, 32, 64, 128, 256]
const PRIMES = [("u32", 65521), ("u61", 2305843009213693951)]

function repetitions(size)
    size <= 16 && return 50
    size <= 32 && return 20
    size <= 64 && return 8
    size <= 128 && return 3
    return 1
end

function measure(operation, count)
    for _ in 1:3
        operation()
    end
    samples = Float64[]
    for _ in 1:7
        elapsed = @elapsed for _ in 1:count
            operation()
        end
        push!(samples, 1000 * elapsed / count)
    end
    return median(samples)
end

function benchmark(field_name, prime, size)
    field = GF(prime)
    source = matrix(
        field,
        size,
        size,
        [inv(field(row + column - 1))
         for row in 1:size for column in 1:size],
    )
    right = matrix(
        field,
        size,
        4,
        [field(row * (column + 1))
         for row in 1:size for column in 1:4],
    )
    repeated_rights = [matrix(
        field,
        size,
        4,
        [field(row * (column + 1) + offset * (row + column - 1))
         for row in 1:size for column in 1:4],
    ) for offset in 0:7]
    context = solve_init(source)
    rank(context) # Materialize the lazy reusable decomposition before timing.
    count = repetitions(size)
    operations = [
        ("rank", () -> rank(source)),
        ("determinant", () -> det(source)),
        ("echelon", () -> rref(source)),
        ("solve-4", () -> solve(source, right; side = :right)),
        ("factor", () -> rank(solve_init(source))),
        ("solve-4-reuse", () -> solve(context, right; side = :right)),
        ("solve-4x8-reuse", () -> begin
            for repeated_right in repeated_rights
                solve(context, repeated_right; side = :right)
            end
        end),
    ]
    for (name, operation) in operations
        milliseconds = measure(operation, count)
        @printf("RESULT %s %d %s %.12f\n",
            field_name, size, name, milliseconds)
    end
end

for (field_name, prime) in PRIMES
    for size in SIZES
        benchmark(field_name, prime, size)
    end
end
