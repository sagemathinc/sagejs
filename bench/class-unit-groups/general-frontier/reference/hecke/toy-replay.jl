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
