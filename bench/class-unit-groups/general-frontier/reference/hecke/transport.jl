# No optional packages and no expression evaluation at the transport boundary.

function frontier_write_json(io::IO, value::AbstractString)
    isvalid(value) || throw(ArgumentError("JSON strings must contain valid UTF-8"))
    print(io, '"')
    for c in value
        if c == '"'
            print(io, "\\\"")
        elseif c == '\\'
            print(io, "\\\\")
        elseif UInt32(c) < 0x20
            print(io, "\\u", lpad(string(UInt32(c); base=16), 4, '0'))
        else
            print(io, c)
        end
    end
    print(io, '"')
end

frontier_write_json(io::IO, ::Nothing) = print(io, "null")
frontier_write_json(io::IO, value::Bool) = print(io, value ? "true" : "false")
frontier_write_json(io::IO, value::Integer) = print(io, value)

function frontier_write_json(io::IO, value::NamedTuple)
    print(io, '{')
    for (i, (key, item)) in enumerate(pairs(value))
        i > 1 && print(io, ',')
        frontier_write_json(io, string(key))
        print(io, ':')
        frontier_write_json(io, item)
    end
    print(io, '}')
end

function frontier_write_json(io::IO, value::Union{AbstractVector,Tuple})
    print(io, '[')
    for (i, item) in enumerate(value)
        i > 1 && print(io, ',')
        frontier_write_json(io, item)
    end
    print(io, ']')
end

# Deliberately no generic show/string fallback: an accidental mathematical
# object must fail here rather than expand a potentially enormous element.
frontier_json(value) = sprint(frontier_write_json, value)

function parse_frontier_request(line::AbstractString)
    ncodeunits(line) <= 1048576 || throw(ArgumentError("request exceeds 1 MiB"))
    fields = split(line, '\t'; keepempty=true)
    length(fields) == 6 || throw(ArgumentError("expected six tab-separated fields"))
    fields[1] == "FRONTIER1" || throw(ArgumentError("unsupported protocol version"))
    occursin(r"\A[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}\z", fields[2]) ||
        throw(ArgumentError("invalid request id"))
    all(occursin(r"\A(?:0|[1-9][0-9]*)\z", fields[i]) for i in 3:5) ||
        throw(ArgumentError("bits, iterations and seed must be unsigned decimal integers"))
    integers = tryparse.(Int, fields[3:5])
    any(isnothing, integers) && throw(ArgumentError("integer field exceeds Julia Int range"))
    bits, iterations, seed = something.(integers)
    bits in (100, 200) || throw(ArgumentError("precision must be 100 or 200"))
    1 <= iterations <= 100000 || throw(ArgumentError("invalid batch size"))
    coefficients = split(fields[6], ','; keepempty=true)
    length(coefficients) >= 3 || throw(ArgumentError("degree must be at least two"))
    all(occursin(r"\A-?(?:0|[1-9][0-9]*)\z", c) for c in coefficients) ||
        throw(ArgumentError("coefficients must be exact signed decimal integers"))
    return (id=String(fields[2]), bits=bits, iterations=iterations, seed=seed,
            coefficients=String.(coefficients))
end
