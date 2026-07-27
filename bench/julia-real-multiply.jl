const CASES = (
    (53, 500_000),
    (1000, 100_000),
    (10_000, 10_000),
)

function allocating_multiply_loop(precision::Int, iterations::Int)
    return setprecision(BigFloat, precision) do
        value = BigFloat("1.25")
        step = BigFloat("1.0000000000000002")
        for _ in 1:iterations
            value = value * step
        end
        value
    end
end

@inline function mpfr_mul!(
    target::BigFloat,
    left::BigFloat,
    right::BigFloat,
)
    ccall(
        (:mpfr_mul, Base.MPFR.libmpfr),
        Cint,
        (
            Ref{BigFloat},
            Ref{BigFloat},
            Ref{BigFloat},
            Base.MPFR.MPFRRoundingMode,
        ),
        target,
        left,
        right,
        Base.MPFR.rounding_raw(BigFloat),
    )
    return target
end

function inplace_multiply_loop(precision::Int, iterations::Int)
    return setprecision(BigFloat, precision) do
        value = BigFloat("1.25")
        step = BigFloat("1.0000000000000002")
        for _ in 1:iterations
            mpfr_mul!(value, value, step)
        end
        value
    end
end

function measure(kind::String, operation, precision::Int, iterations::Int)
    operation(precision, min(iterations, 10_000))
    answer = operation(precision, 1)
    for sample in 0:6
        start = time_ns()
        answer = operation(precision, iterations)
        elapsed = (time_ns() - start) / 1.0e9
        println(
            "RESULT ",
            kind,
            " ",
            precision,
            " ",
            iterations,
            " ",
            sample,
            " ",
            elapsed,
        )
    end
    bytes = @allocated operation(precision, iterations)
    println(
        "ALLOCATED ",
        kind,
        " ",
        precision,
        " ",
        iterations,
        " ",
        bytes,
    )
    return answer
end

println(
    "JULIA ",
    VERSION,
    " MPFR ",
    Base.MPFR.version(),
    " GMP ",
    Base.GMP.version(),
)

for (precision, _) in CASES
    allocating = allocating_multiply_loop(precision, 1000)
    inplace = inplace_multiply_loop(precision, 1000)
    @assert allocating == inplace
    @assert Base.precision(allocating) == precision
    @assert Base.precision(inplace) == precision
end

for (precision, iterations) in CASES
    measure(
        "allocating",
        allocating_multiply_loop,
        precision,
        iterations,
    )
end

for (precision, iterations) in CASES
    measure("inplace", inplace_multiply_loop, precision, iterations)
end
