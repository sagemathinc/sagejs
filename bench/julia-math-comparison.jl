using Printf
using Statistics

const GCD_LEFT = 92_250
const GCD_RIGHT = 922_350
const LARGE_GCD_LEFT = parse(BigInt,
    "13551125668563101951636936867148408377786010712418497242133543153221487310873528750612259354035717265300373778814347320257699257082356550045349914102924249595997483982228699287527241931811325095099642447621242200209254439920196960465321438498305345893378932585393381539093549479296194800838145996187122583354898000")
const LARGE_GCD_RIGHT = parse(BigInt,
    "21926181917556241406686103706309915958486962357677823319609567683411737103996154706784970805215687688521901419825115263702442945271943536926661440182594140777502197056285887176431805932352996517081429110551249721527408760372455849356040271478780238165116043293748873801451260758422788414440690362014196035679949001")

function euclid(a::T, b::T)::T where {T <: Integer}
    while !iszero(b)
        a, b = b, rem(a, b)
    end
    return a
end

function bench_gcd(iterations::Int)::Int
    total = 0
    for index in 0:(iterations - 1)
        total += euclid(GCD_LEFT, GCD_RIGHT + index)
    end
    return total
end

function bench_large_gcd(iterations::Int)::BigInt
    total = BigInt(0)
    for _ in 1:iterations
        total += euclid(LARGE_GCD_LEFT, LARGE_GCD_RIGHT)
    end
    return total
end

Base.@noinline function recursive_fibonacci(n::Int)::Int
    if n == 0 || n == 1
        return 1
    end
    return recursive_fibonacci(n - 1) + recursive_fibonacci(n - 2)
end

function trial_division(n::Int)::Int
    n <= 1 && return n
    iszero(n % 2) && return 2
    iszero(n % 3) && return 3
    iszero(n % 5) && return 5
    differences = (6, 4, 2, 4, 2, 4, 6, 2)
    divisor = 7
    index = 1
    limit = round(Int, sqrt(n))
    while divisor <= limit
        iszero(n % divisor) && return divisor
        divisor += differences[mod(index, 8) + 1]
        index += 1
    end
    return n
end

function prime_counting(bound::Int)::Int
    total = 0
    for value in 1:bound
        total += value > 1 && trial_division(value) == value
    end
    return total
end

function quadratic_sum_wrapping(terms::Int)::Int
    total = 0
    for index in 0:(terms - 1)
        total += 1 - index * index
    end
    return total
end

function quadratic_sum_bigint(terms::Int)::BigInt
    total = BigInt(0)
    for index in 0:(terms - 1)
        total += 1 - BigInt(index) * index
    end
    return total
end

function quadratic_sum_promoting(terms::Int)::BigInt
    total::Union{Int, BigInt} = 0
    for index in 0:(terms - 1)
        term = 1 - index * index
        if total isa Int
            candidate, overflow = Base.Checked.add_with_overflow(total, term)
            total = overflow ? BigInt(total) + term : candidate
        else
            total += term
        end
    end
    return BigInt(total)
end

@inline function mpfr_set_ui!(target::BigFloat, value::UInt)
    ccall(
        (:mpfr_set_ui, Base.MPFR.libmpfr),
        Cint,
        (Ref{BigFloat}, Culong, Base.MPFR.MPFRRoundingMode),
        target,
        value,
        Base.MPFR.rounding_raw(BigFloat),
    )
    return target
end

@inline function mpfr_pow_ui!(target::BigFloat, base::BigFloat, exponent::UInt)
    ccall(
        (:mpfr_pow_ui, Base.MPFR.libmpfr),
        Cint,
        (Ref{BigFloat}, Ref{BigFloat}, Culong, Base.MPFR.MPFRRoundingMode),
        target,
        base,
        exponent,
        Base.MPFR.rounding_raw(BigFloat),
    )
    return target
end

@inline function mpfr_div!(target::BigFloat, left::BigFloat, right::BigFloat)
    ccall(
        (:mpfr_div, Base.MPFR.libmpfr),
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

@inline function mpfr_add!(target::BigFloat, left::BigFloat, right::BigFloat)
    ccall(
        (:mpfr_add, Base.MPFR.libmpfr),
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

function harmonic_cubic_allocating(precision::Int, terms::Int)::BigFloat
    return setprecision(BigFloat, precision) do
        total = BigFloat(0)
        one = BigFloat(1)
        for denominator in 1:terms
            total += one / BigFloat(denominator)^3
        end
        total
    end
end

function harmonic_cubic_inplace(precision::Int, terms::Int)::BigFloat
    return setprecision(BigFloat, precision) do
        total = BigFloat(0)
        one = BigFloat(1)
        denominator = BigFloat(0)
        cube = BigFloat(0)
        term = BigFloat(0)
        for value in 1:terms
            mpfr_set_ui!(denominator, UInt(value))
            mpfr_pow_ui!(cube, denominator, UInt(3))
            mpfr_div!(term, one, cube)
            mpfr_add!(total, total, term)
        end
        total
    end
end

function measure(label::String, operation; repetitions::Int = 1, samples::Int = 7)
    answer = operation()
    operation()
    timings = Float64[]
    for _ in 1:samples
        started = time_ns()
        for _ in 1:repetitions
            answer = operation()
        end
        push!(timings, (time_ns() - started) / 1.0e9 / repetitions)
    end
    bytes = @allocated operation()
    println("RESULT ", label, " ", answer, " ", median(timings), " ", bytes)
    return answer
end

function decimal_result(label::String, operation; repetitions::Int = 200)
    answer = operation()
    operation()
    timings = Float64[]
    for _ in 1:7
        started = time_ns()
        for _ in 1:repetitions
            answer = operation()
        end
        push!(timings, (time_ns() - started) / 1.0e9 / repetitions)
    end
    bytes = @allocated operation()
    value = @sprintf("%.60g", answer)
    println("DECIMAL ", label, " ", value, " ", median(timings), " ", bytes)
    return answer
end

gcd_iterations = parse(Int, get(ENV, "SAGEJS_NATIVE_COWASM_ITERATIONS", "100000"))
large_gcd_iterations = parse(Int, get(ENV, "SAGEJS_NATIVE_COWASM_LARGE_GCD_ITERATIONS", "100"))
fibonacci_input = parse(Int, get(ENV, "SAGEJS_NATIVE_COWASM_FIBONACCI", "30"))
pi_input = parse(Int, get(ENV, "SAGEJS_NATIVE_COWASM_PI", "100000"))
quadratic_terms = parse(Int, get(ENV, "SAGEJS_NATIVE_INTEGER_TERMS", "4000000"))
harmonic_terms = parse(Int, get(ENV, "SAGEJS_MPMATH_AOT_TERMS", "400"))
harmonic_precision = parse(Int, get(ENV, "SAGEJS_MPMATH_AOT_PRECISION", "269"))

println(
    "JULIA ", VERSION,
    " MPFR ", Base.MPFR.version(),
    " GMP ", Base.GMP.version(),
    " THREADS ", Threads.nthreads(),
)

@assert measure("gcd", () -> bench_gcd(gcd_iterations)) == 2_414_484
@assert measure("large_gcd", () -> bench_large_gcd(large_gcd_iterations)) == large_gcd_iterations
@assert measure("recursive_fibonacci", () -> recursive_fibonacci(fibonacci_input)) == 1_346_269
@assert measure("prime_counting", () -> prime_counting(pi_input)) == 9_592

wrapped = measure("quadratic_wrapping", () -> quadratic_sum_wrapping(quadratic_terms))
exact = measure("quadratic_bigint", () -> quadratic_sum_bigint(quadratic_terms))
promoted = measure("quadratic_promoting", () -> quadratic_sum_promoting(quadratic_terms))
@assert exact == -21_333_325_333_330_000_000
@assert promoted == exact
@assert wrapped != exact

allocating = decimal_result(
    "harmonic_allocating",
    () -> harmonic_cubic_allocating(harmonic_precision, harmonic_terms),
)
inplace = decimal_result(
    "harmonic_inplace",
    () -> harmonic_cubic_inplace(harmonic_precision, harmonic_terms),
)
@assert allocating == inplace
