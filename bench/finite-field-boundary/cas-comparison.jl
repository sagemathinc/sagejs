struct ModP{P}
    value::Int

    function ModP{P}(value::Integer) where {P}
        new{P}(mod(Int(value), P))
    end
end

Base.:+(left::ModP{P}, right::ModP{P}) where {P} =
    ModP{P}(left.value + right.value)
Base.:*(left::ModP{P}, right::ModP{P}) where {P} =
    ModP{P}(left.value * right.value)
Base.muladd(left::ModP{P}, right::ModP{P}, addend::ModP{P}) where {P} =
    ModP{P}(left.value * right.value + addend.value)

function bench_field(n, ::Type{T}, multiplier, increment) where {T}
    value = T(1)
    factor = T(multiplier)
    addend = T(increment)
    for _index in 1:n
        value = value * factor + addend
    end
    return value.value
end

function bench_fused(n, ::Type{T}, multiplier, increment) where {T}
    value = T(1)
    factor = T(multiplier)
    addend = T(increment)
    for _index in 1:n
        value = muladd(value, factor, addend)
    end
    return value.value
end

function bench_raw(n, modulus, multiplier, increment)
    value = 1
    for _index in 1:n
        value = (value * multiplier + increment) % modulus
    end
    return value
end

function measure(label, operation)
    started = time_ns()
    checksum = operation()
    elapsed = (time_ns() - started) / 1.0e9
    println(label, " ", elapsed, " ", checksum)
    return checksum
end

function main()
    mode = isempty(ARGS) ? "all" : ARGS[1]
    mode in ("all", "field", "fused", "raw") ||
        throw(ArgumentError("mode must be all, field, fused, or raw"))
    field = ModP{65521}
    iterations = 10_000_000
    operations = Dict(
        "field" => () -> bench_field(iterations, field, 12345, 6789),
        "fused" => () -> bench_fused(iterations, field, 12345, 6789),
        "raw" => () -> bench_raw(iterations, 65521, 12345, 6789),
    )
    selected = mode == "all" ? ("field", "fused", "raw") : (mode,)
    println("VERSION ", VERSION)
    for name in selected
        operation = operations[name]
        measure("COLD_" * uppercase(name), operation)
        name == "field" && bench_field(1_000_000, field, 12345, 6789)
        name == "fused" && bench_fused(1_000_000, field, 12345, 6789)
        name == "raw" && bench_raw(1_000_000, 65521, 12345, 6789)
        for sample in 1:7
            measure(uppercase(name) * " " * string(sample), operation)
        end
    end
end

main()
