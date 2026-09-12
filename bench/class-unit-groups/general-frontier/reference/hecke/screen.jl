# Developer-only Hecke reference screening; not a Sage.js production backend.
using Hecke
using Random
include("transport.jl")

function element_payload(x, K)
    y = K(x)
    return [string(coeff(y, i)) for i in 0:degree(K)-1]
end

function ideal_payload(I, K)
    return [element_payload(b, K) for b in basis(I)]
end

function compact_payload(u, K)
    factors = [(factor=element_payload(b, K), exponent=string(e))
               for (b, e) in u.fac if !iszero(e)]
    sort!(factors; by=x -> join(x.factor, ","))
    return factors
end

group_coordinates(x) = [string(x[i]) for i in 1:ngens(parent(x))]

function generator_product_witness(I, class_images, coordinates)
    coordinates isa AbstractVector || throw(ArgumentError("coordinates must be a vector"))
    length(coordinates) == length(class_images) ||
        throw(ArgumentError("class coordinate count differs from generators"))
    all(c -> (c isa Integer && !(c isa Bool)) || c isa ZZRingElem, coordinates) ||
        throw(ArgumentError("class coordinates must be exact integers"))
    exponents = ZZRingElem[1]
    append!(exponents, (-ZZ(c) for c in coordinates))
    # A map image may be reduced and is not the literal generator product.
    # Keep the entire residual factored, including negative/zero coordinates.
    residual = FacElem([I; class_images], exponents)
    ok, witness = isempty(residual.fac) ? (true, FacElem(one(Hecke.nf(order(I))))) :
                  is_principal_fac_elem(residual)
    ok || error("literal class-generator residual was not principal")
    return witness
end

function regulator_payload(units, bits, proof_policy)
    # Guard bits keep outward-rounded exported endpoints within the request.
    ball = regulator(units, bits + 8)
    lo, hi = setprecision(BigFloat, max(precision(parent(ball)), bits + 64)) do
        Rational{BigInt}(BigFloat(ball, RoundDown)),
        Rational{BigInt}(BigFloat(ball, RoundUp))
    end
    hi - lo < BigInt(1) // (BigInt(1) << (bits - 1)) ||
        error("exported regulator enclosure is too wide")
    return (guarantee="absolute-radius-less-than-2^-bits", bits=bits,
            lower=string(lo), upper=string(hi), display=string(ball),
            fundamental_units_policy=proof_policy)
end

function one_fresh_case(coefficients, bits, proof_policy)
    R, x = polynomial_ring(QQ, "x")
    polynomial = R([QQ(parse(BigInt, string(c))) for c in coefficients])
    degree(polynomial) >= 2 || throw(ArgumentError("degree must be at least two"))
    isone(leading_coefficient(polynomial)) || throw(ArgumentError("polynomial must be monic"))
    K, a = number_field(polynomial, "a"; cached=false)
    O = maximal_order(K)
    grh = proof_policy == "conditional-grh"
    class_started = time_ns()
    C, mC = class_group(O; GRH=grh)
    class_ns = time_ns() - class_started
    unit_started = time_ns()
    U, mU = unit_group_fac_elem(O; GRH=grh)
    unit_ns = time_ns() - unit_started
    class_images = [mC(C[i]) for i in 1:ngens(C)]
    units = [mU(U[i]) for i in 1:ngens(U)]
    unit_coordinates = [preimage(mU, u) for u in units]
    all(unit_coordinates[i] == U[i] for i in 1:ngens(U)) || error("unit round trip failed")
    class_coordinates = [preimage(mC, I) for I in class_images]
    all(class_coordinates[i] == C[i] for i in 1:ngens(C)) || error("class round trip failed")

    function decompose(I)
        c = preimage(mC, I)
        representative = mC(c)
        witness = generator_product_witness(I, class_images,
                                           [c[j] for j in 1:ngens(C)])
        return (coordinates=group_coordinates(c),
                representative=ideal_payload(representative, K),
                generator_product_witness=compact_payload(witness, K))
    end

    probes = [ideal(O, 2, O(a)), ideal(O, 3, O(a + 1)), ideal(O, 5, O(a - 1))]
    decompositions = [decompose(I) for I in probes]
    class_decompositions = [decompose(I) for I in class_images]
    class_powers = []
    for i in 1:ngens(C)
        power = FacElem([class_images[i]], [ZZ(order(C[i]))])
        ok, witness = is_principal_fac_elem(power)
        ok || error("class generator power was not principal")
        push!(class_powers, (exponent=string(order(C[i])), witness=compact_payload(witness, K)))
    end
    result = (
        class_number=string(order(C)), class_invariants=string.(elementary_divisors(C)),
        discriminant=string(discriminant(O)), signature=collect(signature(K)),
        integral_basis=[element_payload(b, K) for b in basis(O)],
        class_generators=[ideal_payload(I, K) for I in class_images],
        class_coordinates=group_coordinates.(class_coordinates),
        class_decompositions=class_decompositions, class_power_witnesses=class_powers,
        unit_invariants=string.(elementary_divisors(U)), torsion_order=string(order(U[1])),
        units=compact_payload.(units, Ref(K)), unit_coordinates=group_coordinates.(unit_coordinates),
        probes=[ideal_payload(I, K) for I in probes], decompositions=decompositions,
        regulator=regulator_payload(units[2:end], bits, proof_policy),
    )
    # Materialize exact compact data inside the timed boundary. No evaluate().
    materialized = frontier_json(result)
    return result, materialized, class_ns, unit_ns
end

function frontier_case(id, coefficients, bits, iterations, seed, proof_policy)
    bits in (100, 200) || throw(ArgumentError("precision must be 100 or 200"))
    1 <= iterations <= 100000 || throw(ArgumentError("invalid batch size"))
    proof_policy isa AbstractString && proof_policy in ("conditional-grh", "unconditional") ||
        throw(ArgumentError("invalid proof policy"))
    Random.seed!(seed)
    compact = nothing
    materialized = ""
    class_ns = UInt64(0)
    unit_ns = UInt64(0)
    started = time_ns()
    for _ in 1:iterations
        compact, materialized, class_call_ns, unit_call_ns = one_fresh_case(coefficients, bits, proof_policy)
        class_ns += class_call_ns
        unit_ns += unit_call_ns
        isempty(materialized) && error("compact materialization failed")
    end
    elapsed_ns = time_ns() - started
    proof_execution = proof_policy == "conditional-grh" ? nothing :
        (method="hecke-class-and-unit-grh-false", class_group_grh=false,
         unit_group_grh=false, completed_iterations=iterations,
         class_group_call_nanoseconds=string(class_ns), unit_group_call_nanoseconds=string(unit_ns))
    return (schema="sagejs-hecke-frontier-screen-v3", id=string(id), bits=bits,
            iterations=iterations, seed=string(seed), elapsed_ns=string(elapsed_ns),
            boundary="persistent-process-fresh-field-complete-compact-screen",
            witness_semantics="ideal-equals-principal-witness-times-literal-class-generator-product",
            proof_policy=proof_policy, proof_execution=proof_execution, independent_replay=false,
            retained_iteration=iterations, batch_outputs_complete=iterations == 1,
            versions=(julia=string(VERSION), hecke=string(Base.pkgversion(Hecke)),
                      nemo=string(Base.pkgversion(Hecke.Nemo))), compact=compact)
end

function main(input=stdin, output=stdout)
    for line in eachline(input)
        isempty(strip(line)) && continue
        id = nothing
        try
            request = parse_frontier_request(line)
            id = request.id
            result = frontier_case(request.id, request.coefficients, request.bits,
                                   request.iterations, request.seed, request.proof_policy)
            println(output, frontier_json((status="ok", result=result)))
        catch err
            println(output, frontier_json((status="error", id=id, error=sprint(showerror, err))))
        end
        flush(output)
    end
end

if abspath(PROGRAM_FILE) == @__FILE__
    main()
end
