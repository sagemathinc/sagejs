using Test
include("screen.jl")

@testset "complete compact Hecke screening" begin
    cases = [
        ("imaginary-class-three", [23, 0, 1], 3, 2, [0, 1]),
        ("real-quadratic", [-2, 0, 1], 1, 2, [2, 0]),
        ("real-cubic", [-1, -1, 0, 1], 1, 2, [1, 1]),
        ("mixed-quartic", [-1, -1, 0, 0, 1], 1, 2, [2, 1]),
        ("rank-three", [1, 0, -10, 0, 1], 1, 2, [4, 0]),
        ("torsion-eight", [1, 0, 0, 0, 1], 1, 8, [0, 2]),
    ]
    for (id, coefficients, h, torsion, sig) in cases, bits in (100, 200)
        result = frontier_case(id, coefficients, bits, 1, 17)
        c = result.compact
        @test c.class_number == string(h)
        @test c.torsion_order == string(torsion)
        @test collect(c.signature) == sig
        @test length(c.units) == sum(sig)
        @test length(c.decompositions) == 3
        @test length(c.class_power_witnesses) == length(c.class_generators)
        @test result.independent_replay == false
        @test c.regulator.bits == bits
        @test c.regulator.guarantee == "absolute-radius-less-than-2^-bits"
        @test all(length(f.factor) == length(coefficients)-1 for u in c.units for f in u)
    end
    batched = frontier_case("fresh-batch", [-2, 0, 1], 100, 2, 17)
    @test batched.iterations == 2
    @test_throws ArgumentError frontier_case("bad-bits", [-2, 0, 1], 53, 1, 17)
    @test_throws ArgumentError frontier_case("bad-batch", [-2, 0, 1], 100, 0, 17)
    @test_throws ArgumentError frontier_case("nonmonic", [-2, 0, 2], 100, 1, 17)
    request = JSON3.write((id="protocol", coefficients=["-2", "0", "1"], bits=100,
                           iterations=1, seed="17"))
    output = IOBuffer()
    main(IOBuffer("not-json\n" * request * "\n"), output)
    responses = JSON3.read.(split(chomp(String(take!(output))), '\n'))
    @test length(responses) == 2
    @test responses[1].status == "error"
    @test responses[2].status == "ok"
    @test responses[2].result.compact.class_number == "1"
end
