# Persistent Hecke/Oscar maximal-order oracle. This is benchmark tooling, not
# part of Sage.js's runtime or implementation.

backend = ARGS[1]
if backend == "hecke"
    @eval using Hecke
    backend_version = string(Base.pkgversion(Hecke))
elseif backend == "oscar"
    @eval using Oscar
    backend_version = string(Base.pkgversion(Oscar))
else
    error("unknown backend $backend")
end
nemo_version = if isdefined(Main, :Nemo)
    string(Base.pkgversion(Main.Nemo))
elseif isdefined(Main, :Hecke) && isdefined(Main.Hecke, :Nemo)
    string(Base.pkgversion(Main.Hecke.Nemo))
else
    "unknown"
end
hecke_version = isdefined(Main, :Hecke) ? string(Base.pkgversion(Main.Hecke)) : "unknown"

function rational_text(value)
    return string(numerator(value), "/", denominator(value))
end

function serialize_basis(order)
    basis = basis_matrix(order)
    rows = String[]
    for row in 1:nrows(basis)
        push!(rows, join((rational_text(basis[row, column]) for column in 1:ncols(basis)), ","))
    end
    return join(rows, ";")
end

function one_sample(polynomial)
    started = time_ns()
    field, _ = number_field(polynomial, "a", cached = false, check = false)
    construction_ms = (time_ns() - started) / 1_000_000
    started = time_ns()
    order = maximal_order(field)
    order_ms = (time_ns() - started) / 1_000_000
    started = time_ns()
    basis = serialize_basis(order)
    field_discriminant = string(discriminant(order))
    materialization_ms = (time_ns() - started) / 1_000_000
    return construction_ms, order_ms, materialization_ms, field_discriminant, basis
end

println(
    "@@NFMO_READY@@",
    backend,
    " ",
    backend_version,
    "; Hecke ",
    hecke_version,
    "; Nemo ",
    nemo_version,
    "; Julia ",
    VERSION,
)
flush(stdout)

for line in eachline(stdin)
    fields = split(chomp(line), '\t')
    request_id = fields[1]
    try
        boundary = fields[2]
        if !(boundary in ("core", "warm-public"))
            println("@@NFMO_RESULT@@", request_id, "\tUNSUPPORTED\tboundary ", boundary)
            flush(stdout)
            continue
        end
        warmups = parse(Int, fields[3])
        sample_count = parse(Int, fields[4])
        coefficients = [parse(BigInt, coefficient) for coefficient in split(fields[5], ',')]
        ring, x = polynomial_ring(ZZ, "x")
        polynomial = ring(coefficients)
        irreducibility_started = time_ns()
        irreducible = is_irreducible(polynomial)
        irreducibility_ms = (time_ns() - irreducibility_started) / 1_000_000
        if !irreducible
            println("@@NFMO_RESULT@@", request_id, "\tUNSUPPORTED\treducible polynomial")
            flush(stdout)
            continue
        end
        for _ in 1:warmups
            one_sample(polynomial)
        end
        raw_samples = String[]
        field_discriminant = ""
        basis = ""
        for _ in 1:sample_count
            construction, order, materialization, field_discriminant, basis = one_sample(polynomial)
            push!(raw_samples, join((construction, order, materialization), ","))
        end
        println(
            "@@NFMO_RESULT@@",
            request_id,
            "\tOK\t",
            irreducibility_ms,
            "\t",
            join(raw_samples, ";"),
            "\t",
            field_discriminant,
            "\t",
            basis,
        )
    catch error
        message = replace(sprint(showerror, error), '\n' => ' ')
        println("@@NFMO_RESULT@@", request_id, "\tERROR\t", message)
    end
    flush(stdout)
end
