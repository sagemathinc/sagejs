using Test
isdefined(@__MODULE__, :parse_frontier_request) || include("transport.jl")

@testset "dependency-free frontier transport" begin
    valid = "FRONTIER2\tcase:1\t100\t2\t17\tconditional-grh\t-123456789012345678901234567890,0,1"
    r = parse_frontier_request(valid)
    @test r.id == "case:1"
    @test (r.bits, r.iterations, r.seed) == (100, 2, 17)
    @test r.coefficients == ["-123456789012345678901234567890", "0", "1"]
    @test r.proof_policy == "conditional-grh"
    @test parse_frontier_request(replace(valid, "conditional-grh" => "unconditional")).proof_policy == "unconditional"
    for bad in (
        "", "{}", replace(valid, "FRONTIER2" => "FRONTIER1"),
        replace(valid, "conditional-grh\t" => ""),
        replace(valid, "conditional-grh" => "Unconditional"),
        replace(valid, "conditional-grh" => "true"),
        replace(valid, "case:1" => "bad id"), replace(valid, "case:1" => "\"quoted\""),
        replace(valid, "case:1" => repeat("a", 129)),
        replace(valid, "\t100\t" => "\t53\t"),
        replace(valid, "\t2\t" => "\t0\t"),
        replace(valid, "\t2\t" => "\t100001\t"),
        replace(valid, "\t17\t" => "\t-1\t"),
        replace(valid, "\t17\t" => "\t017\t"),
        replace(valid, "\t17\t" => "\t99999999999999999999999999999\t"),
        replace(valid, ",0,1" => ",1/2,1"), replace(valid, ",0,1" => ",1e3,1"),
        replace(valid, ",0,1" => ",run(`false`),1"),
        replace(valid, ",0,1" => ",+1,1"), replace(valid, ",0,1" => ",01,1"),
        replace(valid, ",0,1" => ",,1"), replace(valid, ",0,1" => ",1"),
        valid * "\textra", valid * "\n", repeat("a", 1048577),
    )
        @test_throws ArgumentError parse_frontier_request(bad)
    end
    @test frontier_json((a=nothing, b=true, c=false, d=["12345678901234567890", -3], e=())) ==
          "{\"a\":null,\"b\":true,\"c\":false,\"d\":[\"12345678901234567890\",-3],\"e\":[]}"
    @test frontier_json("a\"b\\c\n\r\t\0\b\f\x1f") ==
          "\"a\\\"b\\\\c\\u000a\\u000d\\u0009\\u0000\\u0008\\u000c\\u001f\""
    @test frontier_json("α 😀") == "\"α 😀\""
    @test_throws ArgumentError frontier_json(String(UInt8[0xff]))
    @test_throws MethodError frontier_json(1.5)
    @test_throws MethodError frontier_json(Dict("not" => "in the schema"))
end
