def harmonic_cubic_loop(
    field: RealField, terms: uint64
) -> RealNumber:
    total = field("0")
    one = field("1")
    denominator = field("1")
    denominator_squared = field("1")
    denominator_cubed = field("1")
    term = field("1")
    for _ in range(terms):
        denominator_squared = denominator * denominator
        denominator_cubed = denominator_squared * denominator
        term = one / denominator_cubed
        total = total + term
        denominator = denominator + one
    return total
