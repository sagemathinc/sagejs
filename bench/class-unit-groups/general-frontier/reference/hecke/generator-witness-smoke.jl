# Local exact regression, not a benchmark or deployed-version qualification.
using Test
isdefined(@__MODULE__, :frontier_case) || include("screen.jl")

include("toy-replay.jl")

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
