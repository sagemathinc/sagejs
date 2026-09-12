# Local exact regression, not a benchmark or deployed-version qualification.
using Test
isdefined(@__MODULE__, :frontier_case) || include("screen.jl")

function exact_rational(text)
    parts = split(text, "//")
    return QQ(parse(BigInt, parts[1])) /
           (length(parts) == 1 ? QQ(1) : QQ(parse(BigInt, parts[2])))
end

function decode_element(K, coefficients)
    return sum(exact_rational(c) * gen(K)^(i - 1)
               for (i, c) in enumerate(coefficients))
end

function decode_compact(K, payload)
    # Expanded arithmetic is confined to these small independent test oracles.
    result = one(K)
    for factor in payload
        result *= decode_element(K, factor.factor)^parse(Int, factor.exponent)
    end
    return result
end

function literal_product(O, generators, coordinates)
    result = fractional_ideal(ideal(O, 1))
    for (A, exponent) in zip(generators, coordinates)
        result *= fractional_ideal(A)^Int(exponent)
    end
    return result
end

function checks_equation(K, I, generators, coordinates, payload)
    return fractional_ideal(I) ==
           decode_compact(K, payload) * literal_product(order(I), generators, coordinates)
end

function replay_toy_payload(result, coefficients)
    # Test-only decoded exact-array checks, outside the worker timer. No group
    # recomputation, identical-generator assumption or completeness proof.
    values = parse.(BigInt, string.(coefficients))
    values in ([5, 0, 1], [-2, 0, 1], [1, 0, 0, 0, 1]) ||
        error("toy replay accepts only the three declared small fields")
    R, x = polynomial_ring(QQ, "x")
    K, a = number_field(R(QQ.(values)), "toy"; cached=false)
    O = maximal_order(K)
    compact = result.compact
    decode_ideal(rows) = ideal(O, [O(decode_element(K, row)) for row in rows])
    generators = decode_ideal.(compact.class_generators)
    equations = 0
    for (rows, answer) in zip([compact.probes; compact.class_generators],
                              [compact.decompositions; compact.class_decompositions])
        I = decode_ideal(rows)
        coordinates = parse.(BigInt, answer.coordinates)
        checks_equation(K, I, generators, coordinates, answer.generator_product_witness) ||
            error("decoded literal ideal equation failed")
        changed = [answer.generator_product_witness; (factor=["2"; fill("0", degree(K)-1)], exponent="1")]
        !checks_equation(K, I, generators, coordinates, changed) || error("toy mutation accepted")
        equations += 1
    end
    for (I, power) in zip(generators, compact.class_power_witnesses)
        fractional_ideal(I)^parse(Int, power.exponent) ==
            decode_compact(K, power.witness) * fractional_ideal(ideal(O, 1)) ||
            error("decoded class-power equation failed")
    end
    units = [decode_compact(K, payload) for payload in compact.units]
    for u in units
        abs(norm(O(u))) == 1 || error("decoded element is not an integral unit")
    end
    torsion = parse(Int, compact.torsion_order)
    units[1]^torsion == 1 || error("decoded torsion power failed")
    all(units[1]^j != 1 for j in 1:torsion-1) || error("decoded torsion order failed")
    return (scope="test-only-decoded-exact-payload-not-independent-proof",
            literal_equations=equations, rejected_mutations=equations,
            class_powers=length(generators), units=length(units))
end

if get(ENV, "SAGEJS_FRONTIER_TOY_REPLAY", "0") != "1"
@testset "literal Hecke class-generator witnesses" begin
    Random.seed!(17)
    R, x = polynomial_ring(QQ, "x")
    K, a = number_field(x^2 + 21, "a"; cached=false)
    O = maximal_order(K)
    C, mC = class_group(O; GRH=true)
    @test elementary_divisors(C) == ZZRingElem[2, 2]
    generators = [mC(C[i]) for i in 1:ngens(C)]

    for coordinates in (ZZRingElem[1, 1], ZZRingElem[-1, 1],
                        ZZRingElem[3, -2], ZZRingElem[0, 0])
        I = mC(C(coordinates))
        witness = generator_product_witness(I, generators, coordinates)
        payload = compact_payload(witness, K)
        @test checks_equation(K, I, generators, coordinates, payload)
        changed = copy(coordinates)
        changed[1] += 1
        @test !checks_equation(K, I, generators, changed, payload)
        tampered = [payload; (factor=["2", "0"], exponent="1")]
        @test !checks_equation(K, I, generators, coordinates, tampered)
    end

    # A genuine ideal reduction, not just a relabelled coordinate vector.
    coordinates = ZZRingElem[8, 6]
    unreduced = generators[1]^8 * generators[2]^6
    reduced, multiplier = Hecke.reduce_ideal(unreduced)
    @test reduced != unreduced
    @test norm(reduced) < norm(unreduced)
    @test multiplier * unreduced == reduced
    payload = compact_payload(generator_product_witness(reduced, generators, coordinates), K)
    @test checks_equation(K, reduced, generators, coordinates, payload)
    @test !checks_equation(K, reduced, generators, coordinates, [])

    # The map itself reduces this canonical composite class coordinate.
    K2, a2 = number_field(x^2 + 39, "b"; cached=false)
    O2 = maximal_order(K2)
    C2, mC2 = class_group(O2; GRH=true)
    @test elementary_divisors(C2) == ZZRingElem[4]
    generators2 = [mC2(C2[1])]
    coordinates2 = ZZRingElem[3]
    image2 = mC2(C2(coordinates2))
    @test norm(image2) < norm(generators2[1])^3
    @test !checks_equation(K2, image2, generators2, coordinates2, [])
    payload2 = compact_payload(generator_product_witness(image2, generators2, coordinates2), K2)
    @test checks_equation(K2, image2, generators2, coordinates2, payload2)

    for bad in ([1], [1, 0, 0], [true, false], [1.0, 0.0], ["1", "0"], (1, 0))
        @test_throws ArgumentError generator_product_witness(generators[1], generators, bad)
    end
    @test_throws ErrorException generator_product_witness(generators[1], generators, [0, 0])
    identity = ideal(O, 1)
    empty_generators = typeof(identity)[]
    @test checks_equation(K, identity, empty_generators, [],
                         compact_payload(generator_product_witness(identity, empty_generators, []), K))

    # Exercise the actual serialized producer, not only the residual helper.
    result = frontier_case("literal-product", [21, 0, 1], 100, 1, 17, "conditional-grh")
    @test result.schema == "sagejs-hecke-frontier-screen-v3"
    @test result.witness_semantics == "ideal-equals-principal-witness-times-literal-class-generator-product"
    @test result.independent_replay == false
    @test result.proof_policy == "conditional-grh"
    compact = result.compact
    decoded_generators = [ideal(O, [O(decode_element(K, row)) for row in basis])
                          for basis in compact.class_generators]
    for (input_basis, answer) in zip([compact.probes; compact.class_generators],
                                    [compact.decompositions; compact.class_decompositions])
        I = ideal(O, [O(decode_element(K, row)) for row in input_basis])
        coordinates = parse.(BigInt, answer.coordinates)
        @test checks_equation(K, I, decoded_generators, coordinates,
                              answer.generator_product_witness)
        @test !hasproperty(answer, :witness)
    end
end

println("generator-witness-smoke versions: Julia=", VERSION,
        " Hecke=", Base.pkgversion(Hecke), " Nemo=", Base.pkgversion(Hecke.Nemo))
end
