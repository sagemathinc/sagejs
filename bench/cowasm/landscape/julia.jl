function euclid(a::Int, b::Int)::Int
    while b != 0
        a, b = b, rem(a, b)
    end
    return a
end

function extended_euclid(a::Int, b::Int)::Tuple{Int, Int, Int}
    prevx, x = 1, 0
    prevy, y = 0, 1
    while b != 0
        q, r = divrem(a, b)
        x, prevx = prevx - q * x, x
        y, prevy = prevy - q * y, y
        a, b = b, r
    end
    return a, prevx, prevy
end

function inverse_mod(a::Int, modulus::Int)::Int
    (a == 1 || modulus <= 1) && return mod(a, modulus)
    gcd, coefficient, _ = extended_euclid(a, modulus)
    gcd == 1 || error("not invertible")
    return mod(coefficient, modulus)
end

function trial_division(value::Int)::Int
    value <= 1 && return value
    iszero(value % 2) && return 2
    iszero(value % 3) && return 3
    iszero(value % 5) && return 5
    differences = (6, 4, 2, 4, 2, 4, 6, 2)
    divisor = 7
    index = 1
    limit = round(Int, sqrt(value))
    while divisor <= limit
        iszero(value % divisor) && return divisor
        divisor += differences[mod(index, 8) + 1]
        index += 1
    end
    return value
end

function prime_counting()::Int
    total = 0
    for value in 1:100000
        total += value > 1 && trial_division(value) == value
    end
    return total
end

function gcd_loop()::Int
    total = 0
    for index in 0:99999
        total += euclid(92250, 922350 + index)
    end
    return total
end

function xgcd_loop()::Int
    total = 0
    for index in 0:99999
        total += extended_euclid(92250, 922350 + index)[1]
    end
    return total
end

function inverse_mod_loop()::Int
    total = 0
    for value in 1:99999
        total += inverse_mod(value, 1073741827)
    end
    return total
end

function sum_stride()::Int
    total = 0
    for _ in 0:3:999999
        total += 1
    end
    return total
end

Base.@noinline function recursive_fibonacci_value(n::Int)::Int
    (n == 0 || n == 1) && return 1
    return recursive_fibonacci_value(n - 1) + recursive_fibonacci_value(n - 2)
end
recursive_fibonacci() = recursive_fibonacci_value(30)

function int_to_float()::String
    values = (1, 4, 6, 7, 8, 9)
    total = 0.0
    for _ in 1:1000000, value in values
        total += Float64(value)
    end
    @assert total == 35000000.0
    return "ok"
end

function float_abs()::String
    values = (1.0, -1.234567, 44324.0, 23.4, -43.44e-4)
    total = 0.0
    for _ in 1:1000000, value in values
        total += abs(value)
    end
    @assert 0.999999 <= total / 44349638911.052574 <= 1.000001
    return "ok"
end

function int_divmod()::Int
    values = (1, 1235, 5434, 394879374, -34453)
    total = 0
    for _ in 1:1000000, value in values
        quotient = fld(value, 23)
        remainder = mod(value, 23)
        total += quotient + remainder
    end
    return total
end

const OPERATIONS = Dict{String, Function}(
    "prime_counting" => prime_counting,
    "gcd_loop" => gcd_loop,
    "xgcd_loop" => xgcd_loop,
    "inverse_mod_loop" => inverse_mod_loop,
    "sum_stride" => sum_stride,
    "recursive_fibonacci" => recursive_fibonacci,
    "int_to_float" => int_to_float,
    "float_abs" => float_abs,
    "int_divmod" => int_divmod,
)

function environment_integer(name::String, fallback::Int)::Int
    value = get(ENV, name, "")
    return isempty(value) ? fallback : parse(Int, value)
end

warmups = environment_integer("SAGEJS_LANDSCAPE_WARMUPS", 1)
samples = environment_integer("SAGEJS_LANDSCAPE_SAMPLES", 3)
selection = get(ENV, "SAGEJS_LANDSCAPE_ONLY", "")
selected = isempty(selection) ? collect(keys(OPERATIONS)) : split(selection, ",")
order = [
    "prime_counting", "gcd_loop", "xgcd_loop", "inverse_mod_loop",
    "sum_stride", "recursive_fibonacci", "int_to_float", "float_abs",
    "int_divmod",
]
selected_set = Set(selected)
selected = filter(name -> name in selected_set, order)

println("SAGEJS_COWASM_LANDSCAPE 1")
for (kind, count) in (("WARMUP", warmups), ("RESULT", samples))
    for sample in 0:(count - 1), name in selected
        started = time_ns()
        answer = OPERATIONS[name]()
        elapsed = time_ns() - started
        println(kind, '\t', sample, '\t', name, '\t', elapsed, '\t', answer)
    end
end
println("COMPLETE\t", warmups, '\t', samples, '\t', length(selected))
