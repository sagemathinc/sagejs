"""Independent exact replay for the field-3 prepared owner and embeddings."""

from fractions import Fraction
import json
import sys

sys.set_int_max_str_digits(200000)


def multiply(left, right, polynomial):
    value = [Fraction(0) for _ in range(7)]
    for i in range(4):
        for j in range(4):
            value[i + j] += left[i] * right[j]
    for degree in range(6, 3, -1):
        coefficient = value[degree]
        for j in range(4):
            value[degree - 4 + j] -= coefficient * polynomial[j]
    return value[:4]


def solve_basis(value, basis):
    matrix = [
        [basis[column][row] for column in range(4)] + [value[row]] for row in range(4)
    ]
    for column in range(4):
        pivot = next(row for row in range(column, 4) if matrix[row][column])
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        divisor = matrix[column][column]
        matrix[column] = [entry / divisor for entry in matrix[column]]
        for row in range(4):
            if row == column:
                continue
            factor = matrix[row][column]
            matrix[row] = [
                matrix[row][j] - factor * matrix[column][j] for j in range(5)
            ]
    return [matrix[row][4] for row in range(4)]


def dyadic(triple):
    mantissa, precision, exponent = map(int, triple)
    if precision == -1:
        return Fraction(mantissa)
    shift = exponent + 1 - precision
    return (
        Fraction(mantissa << shift) if shift >= 0 else Fraction(mantissa, 1 << -shift)
    )


def below_power_of_two(value, exponent):
    value = abs(value)
    if exponent >= 0:
        return value < (1 << exponent)
    return value.numerator * (1 << -exponent) < value.denominator


def error_exponent(value):
    value = abs(value)
    if not value:
        return None
    exponent = value.numerator.bit_length() - value.denominator.bit_length()
    if exponent >= 0:
        if value < (1 << exponent):
            exponent -= 1
    elif value * (1 << -exponent) < 1:
        exponent -= 1
    return exponent


def main():
    with open(sys.argv[1], encoding="utf-8") as handle:
        owner = json.load(handle)
    polynomial = list(map(int, owner["polynomial"]))
    assert polynomial == [-2000042, -2000022, 0, 0, 1]
    assert list(map(int, owner["signature"])) == [2, 1]
    denominator = int(owner["zkden"])
    assert denominator == 37
    flat_basis = list(map(int, owner["zk"]))
    basis = [
        [Fraction(flat_basis[4 * column + row], denominator) for row in range(4)]
        for column in range(4)
    ]
    expected_tensor = []
    for i in range(4):
        for j in range(4):
            coordinates = solve_basis(multiply(basis[i], basis[j], polynomial), basis)
            assert all(value.denominator == 1 for value in coordinates)
            expected_tensor.extend(int(value) for value in coordinates)
    tensor = list(map(int, owner["tensor"]))
    assert tensor == expected_tensor

    roots = [dyadic(row[:3]) for row in owner["roots"]]
    complex_root = (roots[2], dyadic(owner["roots"][2][3:6]))
    root_errors = []
    for root in roots[:2]:
        value = root**4 - 2000022 * root - 2000042
        root_errors.append(error_exponent(value))
        assert below_power_of_two(value, -153000)
    a, b = complex_root
    real_value = a**4 - 6 * a * a * b * b + b**4 - 2000022 * a - 2000042
    imaginary_value = 4 * a * b * (a * a - b * b) - 2000022 * b
    root_errors.extend([error_exponent(real_value), error_exponent(imaginary_value)])
    assert below_power_of_two(real_value, -153000)
    assert below_power_of_two(imaginary_value, -153000)

    triples = [owner["embedding"][3 * i : 3 * i + 3] for i in range(16)]
    matrix = [
        [dyadic(triples[4 * row + column]) for column in range(4)] for row in range(4)
    ]
    residuals = []
    for i in range(4):
        for j in range(4):
            coefficients = tensor[16 * i + 4 * j : 16 * i + 4 * j + 4]
            right_real = sum(coefficients[k] * matrix[2][k] for k in range(4))
            right_imag = sum(coefficients[k] * matrix[3][k] for k in range(4))
            left_real = matrix[2][i] * matrix[2][j] - matrix[3][i] * matrix[3][j]
            left_imag = matrix[2][i] * matrix[3][j] + matrix[3][i] * matrix[2][j]
            residuals.extend([left_real - right_real, left_imag - right_imag])
            for row in range(2):
                right = sum(coefficients[k] * matrix[row][k] for k in range(4))
                residuals.append(matrix[row][i] * matrix[row][j] - right)
    assert all(below_power_of_two(value, -153000) for value in residuals)
    print(
        json.dumps(
            {
                "status": "pass",
                "tensorCells": len(tensor),
                "basisProducts": 16,
                "rootResidualExponents": root_errors,
                "embeddingIdentityResidualMaximumExponent": max(
                    error_exponent(value) for value in residuals if value
                ),
            }
        )
    )


if __name__ == "__main__":
    main()
