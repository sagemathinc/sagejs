# Fixed transport adapter only; mathematics remains in the existing worker.
include(ARGS[1])
println(ARGS[2])
flush(stdout)
for line in eachline(stdin)
    isempty(strip(line)) && continue
    id = nothing
    try
        request = parse_frontier_request(line)
        id = request.id
        measured = @timed frontier_case(request.id, request.coefficients,
                                        request.bits, request.iterations, request.seed)
        println(frontier_json((status="ok", result=measured.value,
            diagnostics=(scope="frontier_case-only-not-final-envelope-serialization",
                         julia_compile_seconds=string(measured.compile_time),
                         julia_recompile_seconds=string(measured.recompile_time)))))
    catch err
        println(frontier_json((status="error", id=id, error=sprint(showerror, err))))
    end
    flush(stdout)
end
