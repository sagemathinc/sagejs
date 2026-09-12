# Fixed transport adapter only; mathematics remains in the existing worker.
include(ARGS[1])
toy_replay = length(ARGS) == 3 && ARGS[3] == "--toy-replay"
if toy_replay
    include(joinpath(dirname(ARGS[1]), "toy-replay.jl"))
end
println(ARGS[2])
flush(stdout)
for line in eachline(stdin)
    isempty(strip(line)) && continue
    id = nothing
    try
        request = parse_frontier_request(line)
        id = request.id
        measured = @timed frontier_case(request.id, request.coefficients,
                                        request.bits, request.iterations, request.seed, request.proof_policy)
        toy = if !toy_replay
            nothing
        elseif measured.value.schema == "sagejs-hecke-frontier-screen-v4"
            (scope="test-only-every-batch-output-not-independent-proof",
             iteration_checks=[(iteration=entry.iteration,
                checks=replay_toy_payload((compact=entry.compact,), request.coefficients))
                for entry in measured.value.iteration_outputs])
        else
            replay_toy_payload(measured.value, request.coefficients)
        end
        println(frontier_json((status="ok", result=measured.value,
            diagnostics=(scope="frontier_case-only-not-final-envelope-serialization",
                         julia_compile_seconds=string(measured.compile_time),
                         julia_recompile_seconds=string(measured.recompile_time),
                         toy_replay=toy))))
    catch err
        println(frontier_json((status="error", id=id, error=sprint(showerror, err))))
    end
    flush(stdout)
end
