"""Persistent Oscar/Hecke worker for number-field foundation benchmarks."""

using Oscar
using JSON3

const RESULT_PREFIX = "@@NFFP_RESULT@@"

integer_value(value) = value isa AbstractString ? parse(Int, value) : Int(value)

function make_field(request, sample_index)
  ring, x = polynomial_ring(QQ, "x")
  coefficients = request["coefficients"]
  polynomial = sum(QQ(integer_value(coefficients[index + 1])) * x^index for index in 0:(length(coefficients) - 1))
  name = sample_index < 0 ? "aw$(abs(sample_index))" : "a$(sample_index)"
  return number_field(polynomial, name)
end

function local_data(order, polynomial, index_squared, prime)
  if mod(index_squared, prime) == 0
    return sort([[Int(exponent), Int(degree(ideal))] for (ideal, exponent) in prime_decomposition(order, prime)])
  end
  field = GF(prime)
  ring, _ = polynomial_ring(field, "y")
  reduced = change_base_ring(field, polynomial; parent = ring)
  return sort([[Int(exponent), Int(degree(factor_polynomial))] for (factor_polynomial, exponent) in factor(reduced)])
end

function splitting_rows(order, polynomial, bound)
  index_squared = div(abs(ZZ(discriminant(polynomial))), abs(discriminant(order)))
  return [
    [Int(prime), local_data(order, polynomial, index_squared, prime)]
    for prime in PrimesSet(2, bound - 1)
  ]
end

function local_coefficient(degrees, exponent)
  coefficients = zeros(Int, exponent + 1)
  coefficients[1] = 1
  for degree in degrees
    for index in degree:exponent
      coefficients[index + 1] += coefficients[index - degree + 1]
    end
  end
  return coefficients[exponent + 1]
end

function zeta_coefficients(order, polynomial, bound)
  index_squared = div(abs(ZZ(discriminant(polynomial))), abs(discriminant(order)))
  degrees = Dict{Int, Vector{Int}}()
  for prime in PrimesSet(2, bound)
    factors = local_data(order, polynomial, index_squared, prime)
    degrees[Int(prime)] = [factor[2] for factor in factors]
  end
  answer = ones(Int, bound)
  for integer in 2:bound
    coefficient = 1
    for (prime, exponent) in factor(ZZ(integer))
      coefficient *= local_coefficient(degrees[Int(prime)], Int(exponent))
    end
    answer[integer] = coefficient
  end
  return answer
end

function one_sample(request, sample_index)
  field, _ = make_field(request, sample_index)
  polynomial = defining_polynomial(field)
  operation = String(request["operation"])
  bound = Int(get(request, "bound", 0))
  if operation == "prime-stream"
    nf_order = maximal_order(field)
    started = time_ns()
    answer = splitting_rows(nf_order, polynomial, bound)
  elseif operation == "coefficients"
    started = time_ns()
    nf_order = maximal_order(field)
    answer = zeta_coefficients(nf_order, polynomial, bound)
  elseif operation == "global-arithmetic"
    started = time_ns()
    nf_order = maximal_order(field)
    units, _ = unit_group(nf_order)
    classes, _ = class_group(nf_order)
    regulator_value = regulator(nf_order)
    answer = Dict(
      "unit_rank" => count(==(0), Int.(abelian_invariants(units))),
      "unit_complete" => true,
      "class_complete" => true,
      "class_number" => Int(order(classes)),
      "regulator" => string(Float64(regulator_value)),
    )
  elseif operation in ("quadratic-zeta-batch", "general-zeta-scalar")
    throw(ErrorException("Oscar/Hecke does not expose the required arbitrary-complex Dedekind-zeta evaluator"))
  else
    throw(ArgumentError("unknown benchmark operation $operation"))
  end
  return Dict("timing_ms" => (time_ns() - started) / 1_000_000, "result" => answer)
end

function run_request(request)
  for warmup in 1:Int(get(request, "warmups", 0))
    one_sample(request, -warmup)
  end
  return Dict(
    "status" => "ok",
    "samples" => [one_sample(request, index) for index in 0:(Int(get(request, "samples", 1)) - 1)],
  )
end

println("@@NFFP_READY@@Julia $(VERSION), Oscar $(pkgversion(Oscar)), Hecke $(pkgversion(Hecke))")
flush(stdout)
for line in eachline(stdin)
  response = try
    run_request(JSON3.read(line))
  catch error
    if occursin("arbitrary-complex", sprint(showerror, error))
      Dict("status" => "unsupported", "reason" => sprint(showerror, error))
    else
      Dict(
        "status" => "error",
        "reason" => sprint(showerror, error),
        "traceback" => sprint(showerror, error, catch_backtrace()),
      )
    end
  end
  println(RESULT_PREFIX * JSON3.write(response))
  flush(stdout)
end
