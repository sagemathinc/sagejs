using Hecke
import Nemo
import AbstractAlgebra

const BOUNDS = Dict(6 => 5, 7 => 11, 8 => 20, 9 => 47, 10 => 97)
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
                53, 59, 61, 67, 71, 73, 79, 83, 89, 97]

function evaluate_degree(degree)
  ring, x = polynomial_ring(Nemo.QQ, "x")
  polynomial = x^degree - x - 1

  function fresh_order()
    field, _generator = number_field(polynomial, "a$(degree)"; cached = false)
    return field, maximal_order(field)
  end

  field, maximal_order_value = fresh_order()
  equation_discriminant = Nemo.ZZ(discriminant(polynomial))
  field_discriminant = discriminant(maximal_order_value)
  index = isqrt(abs(divexact(equation_discriminant, field_discriminant)))
  field_signature = signature(field)
  println("FIELD|", degree, "|", field_signature[1], "|", field_signature[2],
          "|", equation_discriminant, "|", field_discriminant, "|", index,
          "|", BOUNDS[degree])

  for (label, grh) in (("conditional_grh", true), ("unconditional", false))
    mode_field, mode_order = fresh_order()
    started = time()
    class_group_result, _class_map = class_group(mode_order; GRH = grh)
    unit_group_result, _unit_map = unit_group_fac_elem(mode_order; GRH = grh)
    elapsed = time() - started
    class_invariants = join(string.(elementary_divisors(class_group_result)), ",")
    unit_invariants = elementary_divisors(unit_group_result)
    torsion = isempty(unit_invariants) ? 1 : unit_invariants[1]
    rank = Hecke.unit_group_rank(mode_order)
    regulator_value = Float64(regulator(mode_order))
    println("MODE|", degree, "|", label, "|", class_invariants, "|",
            order(class_group_result), "|", join(string.(unit_invariants), ","),
            "|", rank, "|", torsion, "|", regulator_value, "|", elapsed)
  end

  for rational_prime in filter(p -> p <= BOUNDS[degree], PRIMES)
    factors = [(Int(e), Int(valuation(norm(P), rational_prime)))
               for (P, e) in prime_decomposition(maximal_order_value, rational_prime)]
    sort!(factors)
    encoded = join(["$(e),$(f)" for (e, f) in factors], ";")
    println("PRIME|", degree, "|", rational_prime, "|", encoded)
  end
end

degrees = isempty(ARGS) ? collect(6:10) : parse.(Int, ARGS)
if any(degree -> !haskey(BOUNDS, degree), degrees)
  error("supported degrees are 6 through 10")
end
println("META|", VERSION, "|", Base.pkgversion(Hecke), "|",
        Base.pkgversion(Nemo), "|", Base.pkgversion(AbstractAlgebra))
for degree in degrees
  evaluate_degree(degree)
end
