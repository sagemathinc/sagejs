from __future__ import annotations


A = matrix(ZZ, 2, 2, [1, 2, 3, 4])
assert Matrix([[1, 2], [3, 4]]) == A
assert Matrix(ZZ, 2, 2, [1, 2, 3, 4]) == A
assert MatrixSpace(IntegerRing(), 2) is MatrixSpace(ZZ, 2)
assert list(matrix([]).dimensions()) == [0, 0]
assert list(matrix([5]).dimensions()) == [1, 1]
assert list(matrix([1, 2]).dimensions()) == [1, 2]
assert str(A) == '[1 2]\n[3 4]'
large_matrix = zero_matrix(QQ, 20, 1)
assert str(large_matrix) == (
    "20 x 1 dense matrix over Rational Field "
    "(use the '.str()' method to see the entries)")
assert len(large_matrix.str().splitlines()) == 20
assert A.parent() is MatrixSpace(ZZ, 2)
assert A.base_ring() is ZZ
assert isinstance(A.dimensions(), tuple)
assert list(A.dimensions()) == [2, 2]
assert bool(A)
assert not bool(zero_matrix(ZZ, 2))
assert A.is_zero() is False
assert zero_matrix(ZZ, 2).is_zero() is True
assert identity_matrix(ZZ, 2).is_one() is True
assert A.is_one() is False
assert MatrixSpace(ZZ, 2).one() == identity_matrix(ZZ, 2)
assert MatrixSpace(ZZ, 2, 3).zero() == zero_matrix(ZZ, 2, 3)
assert MatrixSpace(ZZ, 2).matrix_space(3, 4) is MatrixSpace(ZZ, 3, 4)
assert 'sparse matrices' in str(MatrixSpace(QQ, 2, sparse=True))
matrix_basis = MatrixSpace(QQ, 2, 3).basis()
assert len(matrix_basis) == 6
assert matrix_basis[1, 2] == matrix(
    QQ, [[0, 0, 0], [0, 0, 1]])
assert list(matrix_basis)[1] == matrix(
    QQ, [[0, 1, 0], [0, 0, 0]])
assert A.list() == [1, 2, 3, 4]
assert A[0, 1] == 2
assert A[-1, -1] == 4
assert A[0] == vector(ZZ, [1, 2])
assert A.rows() == [vector([1, 2]), vector([3, 4])]
assert A.columns() == [vector([1, 3]), vector([2, 4])]
assert list(A.row(1, from_list=True)) == [3, 4]
assert list(A.column(1, from_list=True)) == [2, 4]
assert vector(ZZ, 3, range(3)) == vector(ZZ, [0, 1, 2])

assert A.det() == -2
assert A.determinant() == -2
assert A.det(algorithm='flint') == -2
assert A.rank() == 2
assert A.rank(algorithm='modp') == 2
assert A.rref() == identity_matrix(QQ, 2)
singular = matrix([[1, 2, 3], [3, 2, 1], [1, 1, 1]])
solution = singular.solve_right(vector([0, -4, -1]))
assert solution == vector(QQ, [-2, 1, 0])
assert singular * solution == vector(QQ, [0, -4, -1])
assert A.rref().base_ring() is QQ
assert A.hermite_form() == matrix(ZZ, [[1, 0], [0, 2]])
assert A.echelon_form() == A.hermite_form()
assert A.transpose() == matrix(ZZ, [[1, 3], [2, 4]])
assert A.T == A.transpose()
subdivided = matrix(ZZ, 2, 3, range(6))
subdivided.subdivide(None, 1)
assert str(subdivided) == '[0|1 2]\n[3|4 5]'
assert str(subdivided.transpose()) == '[0 3]\n[---]\n[1 4]\n[2 5]'
assert A * A == matrix(ZZ, [[7, 10], [15, 22]])
assert A._sparse_left_multiply(A) == A * A
assert A.matrix_from_rows([1, 0, 1]) == matrix(ZZ, [[3, 4], [1, 2], [3, 4]])
assert A.matrix_from_columns([1, 0, 1]) == matrix(ZZ, [[2, 1, 2], [4, 3, 4]])
assert A ** 0 == identity_matrix(ZZ, 2)
assert A ** 3 == matrix(ZZ, [[37, 54], [81, 118]])
assert -A == matrix(ZZ, [[-1, -2], [-3, -4]])
assert 3 * A == matrix(ZZ, [[3, 6], [9, 12]])
assert A / 2 == matrix(QQ, [[QQ(1, 2), 1], [QQ(3, 2), 2]])

inverse = A.inverse()
assert inverse.base_ring() is QQ
assert inverse == matrix(
    QQ, [[-2, 1], [QQ(3, 2), QQ(-1, 2)]])
assert ~A == inverse
assert A * inverse == identity_matrix(QQ, 2)
assert A.solve_right(
    vector(QQ, [1, 0])) == vector(QQ, [-2, QQ(3, 2)])
assert A.solve_right(identity_matrix(ZZ, 2)) == inverse
assert A * vector(ZZ, [1, 2]) == vector(ZZ, [5, 11])

Q = matrix(
    QQ,
    [[QQ(1, 2), QQ(1, 3)], [QQ(2, 5), QQ(3, 7)]],
)
assert Q.det() == QQ(17, 210)
assert Q.rank() == 2
assert Q + A == matrix(
    QQ,
    [[QQ(3, 2), QQ(7, 3)], [QQ(17, 5), QQ(31, 7)]],
)
assert Q * A == matrix(
    QQ,
    [[QQ(3, 2), QQ(7, 3)], [QQ(59, 35), QQ(88, 35)]],
)

rectangular = matrix(ZZ, 2, 3, lambda row, col: row + col)
assert rectangular == matrix(ZZ, [[0, 1, 2], [1, 2, 3]])
assert rectangular * rectangular.T == matrix(ZZ, [[5, 8], [8, 14]])
assert rectangular.rank() == 2
assert rectangular.nullity() == 0
assert rectangular.right_nullity() == 1
assert list(rectangular.pivots()) == [0, 1]
assert rectangular.row_space().basis_matrix() == matrix(
    ZZ, [[1, 0, -1], [0, 1, 2]])
assert rectangular.image() == rectangular.row_space()
assert rectangular.column_space().basis_matrix() == identity_matrix(ZZ, 2)
assert rectangular.stack(vector(ZZ, [2, 3, 4])) == matrix(
    ZZ, [[0, 1, 2], [1, 2, 3], [2, 3, 4]])
assert rectangular.augment(vector(ZZ, [5, 6])) == matrix(
    ZZ, [[0, 1, 2, 5], [1, 2, 3, 6]])
assert rectangular.matrix_from_rows([1, 0]) == matrix(
    ZZ, [[1, 2, 3], [0, 1, 2]])
assert rectangular.matrix_from_columns([2, 0]) == matrix(
    ZZ, [[2, 0], [3, 1]])
assert rectangular.diagonal() == [0, 2]
assert A.trace() == 5

dependent = matrix(ZZ, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9])
assert dependent.rref() == matrix(
    QQ, [[1, 0, -1], [0, 1, 2], [0, 0, 0]])
assert dependent.hermite_form() == matrix(
    ZZ, [[1, 2, 3], [0, 3, 6], [0, 0, 0]])
assert dependent.echelon_form() == dependent.hermite_form()
hermite, hermite_left = dependent.hermite_form(transformation=True)
assert hermite_left * dependent == hermite
short_hermite, short_left = dependent.hermite_form(
    transformation=True, include_zero_rows=False)
assert list(short_hermite.dimensions()) == [2, 3]
assert list(short_left.dimensions()) == [2, 3]
assert short_left * dependent == short_hermite
smith, smith_left, smith_right = dependent.smith_form()
assert smith == diagonal_matrix(ZZ, [1, 3, 0])
assert smith_left * dependent * smith_right == smith
assert dependent.elementary_divisors() == [1, 3, 0]
assert dependent.charpoly()(dependent) == zero_matrix(ZZ, 3)
assert dependent.minpoly()(dependent) == zero_matrix(ZZ, 3)
assert zero_matrix(ZZ, 2) == 0
assert identity_matrix(ZZ, 2) == 1
assert A != 0

wide_smith_source = matrix(ZZ, 2, 3, [3, 0, 1, 0, 1, 0])
wide_smith, wide_left, wide_right = wide_smith_source.smith_form()
assert wide_left * wide_smith_source * wide_right == wide_smith
assert wide_smith_source.elementary_divisors() == [1, 1]

tall_smith_source = wide_smith_source.transpose()
tall_smith, tall_left, tall_right = tall_smith_source.smith_form()
assert tall_left * tall_smith_source * tall_right == tall_smith
assert tall_smith_source.elementary_divisors() == [1, 1, 0]

rational_echelon = matrix(
    QQ, [[QQ(1, 2), 1], [0, 1]])
assert rational_echelon.rref() == identity_matrix(QQ, 2)
assert rational_echelon.echelon_form() == identity_matrix(QQ, 2)

integer_kernel = matrix(
    ZZ, [[1, 2, 3], [2, 4, 6]]).right_kernel()
assert integer_kernel.base_ring() is ZZ
assert integer_kernel.degree() == 3
assert integer_kernel.dimension() == 2
assert integer_kernel.rank() == 2
assert integer_kernel.ambient_module() is VectorSpace(ZZ, 3)
assert integer_kernel.basis_matrix() == matrix(
    ZZ, [[1, 1, -1], [0, 3, -2]])
assert integer_kernel.basis() == [
    vector(ZZ, [1, 1, -1]),
    vector(ZZ, [0, 3, -2]),
]
assert vector(ZZ, [1, 1, -1]) in integer_kernel
assert vector(ZZ, [1, 0, 0]) not in integer_kernel
assert integer_kernel([1, 1, -1]) == vector(ZZ, [1, 1, -1])

left_kernel = matrix(
    ZZ, [[1, 2, 3], [2, 4, 6]]).left_kernel()
assert left_kernel.degree() == 2
assert left_kernel.basis_matrix() == matrix(ZZ, [[2, -1]])
assert vector(ZZ, [2, -1]) in left_kernel
assert matrix(
    ZZ, [[1, 2, 3], [2, 4, 6]]).kernel() == left_kernel

rational_kernel = matrix(
    QQ, [[1, 2, 3], [2, 4, 6]]).right_kernel()
assert rational_kernel.base_ring() is QQ
assert rational_kernel.basis_matrix() == matrix(
    QQ,
    [
        [1, 0, QQ(-1, 3)],
        [0, 1, QQ(-2, 3)],
    ],
)

left_line = matrix(ZZ, [[0], [1]]).kernel()
slanted_line = matrix(ZZ, [[2], [-1]]).kernel()
line_sum = left_line + slanted_line
assert line_sum.basis_matrix() == matrix(
    ZZ, [[1, 0], [0, 2]])
assert line_sum.dimension() == 2
assert vector(ZZ, [0, 1]) not in line_sum
assert vector(ZZ, [0, 2]) in line_sum
assert left_line.intersection(slanted_line).dimension() == 0
vertical_line = matrix(ZZ, [[1], [0]]).kernel()
other_slanted_line = matrix(ZZ, [[1], [-2]]).kernel()
other_line_sum = vertical_line + other_slanted_line
assert other_line_sum.basis_matrix() == matrix(
    ZZ, [[2, 0], [0, 1]])
assert line_sum.intersection(other_line_sum).basis_matrix() == matrix(
    ZZ, [[2, 0], [0, 2]])

rational_plane_x = matrix(QQ, [[1], [0], [0]]).kernel()
rational_plane_z = matrix(QQ, [[0], [0], [1]]).kernel()
assert (rational_plane_x + rational_plane_z).basis_matrix() == (
    identity_matrix(QQ, 3)
)
rational_axis = rational_plane_x.intersection(rational_plane_z)
assert rational_axis.basis_matrix() == matrix(QQ, [[0, 1, 0]])
assert vector(QQ, [0, 3, 0]) in rational_axis
assert vector(QQ, [1, 0, 0]) not in rational_axis

assert A.charpoly() == PolynomialRing(ZZ, 'x')(
    PolynomialRing(ZZ, 'x').gen() ** 2
    - 5 * PolynomialRing(ZZ, 'x').gen()
    - 2
)
assert str(A.charpoly()) == 'x^2 - 5*x - 2'
assert str(A.characteristic_polynomial('t')) == 't^2 - 5*t - 2'
assert str(rational_echelon.charpoly()) == 'x^2 - 3/2*x + 1/2'

huge = Integer(
    '1606938044258990275541962092341162602522202993782792835301499')
large = matrix(ZZ, [[huge, 1], [1, huge]])
assert large.det() == huge * huge - 1

assert zero_matrix(QQ, 2, 3) == matrix(QQ, 2, 3)
assert diagonal_matrix([2, 3, 5]) == matrix(
    ZZ, [[2, 0, 0], [0, 3, 0], [0, 0, 5]])
assert VectorSpace(QQ, 2)([1, 2]).parent() is VectorSpace(QQ, 2)
assert vector([1, 2, 3]).dot_product(vector([4, 5, 6])) == 32

set_random_seed(2026)
random_integer = random_matrix(ZZ, 3, 4, x=-5, y=5)
set_random_seed(2026)
assert random_matrix(ZZ, 3, 4, x=-5, y=5) == random_integer
assert all(-5 <= value < 5 for value in random_integer.list())
assert random_integer.base_ring() is ZZ
assert random_matrix(QQ, 2, 3).base_ring() is QQ
assert random_matrix(ZZ, 3, density=0) == zero_matrix(ZZ, 3)
uniform = matrix.random(
    ZZ, 4, 5, distribution='uniform', density=0.6)
assert all(-2 <= value <= 2 for value in uniform.list())
assert uniform.density() <= 0.6
assert not uniform.is_sparse()

F5 = GF(5)
finite = matrix(F5, [[1, 2], [3, 4]])
assert Matrix(F5, [[1, 2], [3, 4]]) == finite
assert finite.base_ring() is F5
assert finite.list() == [F5(1), F5(2), F5(3), F5(4)]
assert finite + finite == matrix(F5, [[2, 4], [1, 3]])
assert finite - finite == zero_matrix(F5, 2)
assert -finite == matrix(F5, [[4, 3], [2, 1]])
assert 3 * finite == matrix(F5, [[3, 1], [4, 2]])
assert finite / 2 == matrix(F5, [[3, 1], [4, 2]])
assert finite * finite == matrix(F5, [[2, 0], [0, 2]])
assert finite.det() == F5(3)
assert finite.rank() == 2
assert finite.rref() == identity_matrix(F5, 2)
assert finite.rref().base_ring() is F5
finite_inverse = finite.inverse()
assert finite_inverse.base_ring() is F5
assert finite_inverse == matrix(F5, [[3, 1], [4, 2]])
assert finite * finite_inverse == identity_matrix(F5, 2)
assert finite.inverse_of_unit('flint') == finite_inverse
assert finite.is_invertible()
assert finite.is_unit()
assert finite.solve_right(
    vector(F5, [1, 0])) == vector(F5, [3, 4])
assert finite.solve_right(
    identity_matrix(F5, 2)) == finite_inverse
assert str(finite.charpoly()) == 'x^2 + 3'
assert finite.charpoly()(finite) == zero_matrix(F5, 2)
assert finite.minpoly()(finite) == zero_matrix(F5, 2)

F2 = GF(2)
binary_fibonacci = matrix(F2, [[1, 1], [1, 0]])
assert str(binary_fibonacci.charpoly()) == 'x^2 + x + 1'
assert binary_fibonacci.charpoly()(binary_fibonacci) == (
    zero_matrix(F2, 2)
)

finite_singular = matrix(
    F5, [[1, 2, 3], [2, 4, 1]])
assert finite_singular.rank() == 1
assert finite_singular.right_nullity() == 2
assert not finite_singular.is_invertible()
assert finite_singular.rref() == matrix(
    F5, [[1, 2, 3], [0, 0, 0]])
finite_kernel = finite_singular.right_kernel()
assert finite_singular.right_kernel_matrix() == (
    finite_kernel.basis_matrix()
)
assert finite_singular.right_kernel_matrix(
    basis='computed') == finite_kernel.basis_matrix()
assert finite_kernel.base_ring() is F5
assert finite_kernel.dimension() == 2
assert finite_singular * finite_kernel.basis_matrix().T == (
    zero_matrix(F5, 2, 2)
)
assert finite_singular.left_kernel().dimension() == 1
assert finite_singular.left_kernel_matrix() == (
    finite_singular.left_kernel().basis_matrix()
)
assert vector(F5, [3, 1]) in finite_singular.left_kernel()
assert matrix(ZZ, [[1, 2], [3, 4]]).change_ring(F5) == finite
assert finite + matrix(ZZ, [[1, 1], [1, 1]]) == matrix(
    F5, [[2, 3], [4, 0]])

set_random_seed(2026)
random_finite = random_matrix(F5, 4, 6)
set_random_seed(2026)
assert random_matrix(F5, 4, 6) == random_finite
assert random_finite.base_ring() is F5
assert all(
    value == F5(value.lift())
    for value in random_finite.list())

F9 = GF(9, 'a')
a = F9.gen()
extension_matrix = matrix(F9, [[a, 1], [1, 0]])
assert Matrix(F9, [[a, 1], [1, 0]]) == extension_matrix
assert extension_matrix.base_ring() is F9
assert extension_matrix.list() == [a, F9(1), F9(1), F9(0)]
assert extension_matrix + extension_matrix == matrix(
    F9, [[2 * a, 2], [2, 0]])
assert extension_matrix - extension_matrix == zero_matrix(F9, 2)
assert -extension_matrix == matrix(
    F9, [[2 * a, 2], [2, 0]])
assert a * extension_matrix == matrix(
    F9, [[a * a, a], [a, 0]])
assert extension_matrix / a == extension_matrix * (a ** -1)
assert extension_matrix.det() == F9(2)
assert extension_matrix.rank() == 2
assert extension_matrix.rref() == identity_matrix(F9, 2)
extension_inverse = extension_matrix.inverse()
assert extension_inverse == matrix(F9, [[0, 1], [1, 2 * a]])
assert extension_matrix * extension_inverse == identity_matrix(F9, 2)
assert extension_matrix.solve_right(
    vector(F9, [a, 1])) == vector(F9, [1, 0])
assert str(extension_matrix.charpoly()) == 'x^2 + (2*a)*x + 2'
assert extension_matrix.charpoly()(extension_matrix) == (
    zero_matrix(F9, 2)
)
assert extension_matrix.minpoly()(extension_matrix) == (
    zero_matrix(F9, 2)
)

extension_row = matrix(F9, [[1, a, a + 1]])
extension_kernel = extension_row.right_kernel()
assert extension_kernel.base_ring() is F9
assert extension_kernel.dimension() == 2
assert extension_kernel.basis_matrix() == matrix(
    F9,
    [
        [1, 0, a + 1],
        [0, 1, 2 * a + 1],
    ],
)
assert extension_row * extension_kernel.basis_matrix().T == (
    zero_matrix(F9, 1, 2)
)
assert extension_row.left_kernel().dimension() == 0
assert matrix(
    F9, [[1], [a], [a + 1]]).kernel().dimension() == 2
assert matrix(ZZ, [[1, 2], [3, 4]]).change_ring(F9) == matrix(
    F9, [[1, 2], [0, 1]])

set_random_seed(2026)
random_extension = random_matrix(F9, 4, 6)
set_random_seed(2026)
assert random_matrix(F9, 4, 6) == random_extension
assert random_extension.base_ring() is F9
assert all(value.parent() is F9 for value in random_extension.list())
assert any(value not in [F9(0), F9(1), F9(2)]
           for value in random_extension.list())

R36 = Zmod(36)
residue_matrix = matrix(R36, [[2, 3], [3, 2]])
assert residue_matrix.base_ring() is R36
assert residue_matrix.det() == R36(31)
assert residue_matrix.is_invertible()
assert residue_matrix.inverse() == matrix(
    R36, [[14, 15], [15, 14]])
assert residue_matrix * residue_matrix.inverse() == (
    identity_matrix(R36, 2)
)
assert residue_matrix.solve_right(
    vector(R36, [1, 0])) == vector(R36, [14, 15])
assert str(residue_matrix.charpoly()) == 'x^2 + 32*x + 31'
assert residue_matrix.charpoly()(residue_matrix) == (
    zero_matrix(R36, 2)
)

R625 = Zmod(625)
howell_source = matrix(
    R625,
    3,
    4,
    [1, 2, 3, 4, 0, 5, 5, 6, 0, 0, 0, 25],
)
assert howell_source.howell_form() == matrix(
    R625,
    [
        [1, 2, 3, 4],
        [0, 5, 5, 6],
        [0, 0, 0, 25],
        [0, 0, 0, 0],
    ],
)
assert howell_source.echelon_form() == howell_source.howell_form()
assert howell_source.rank() == 1
assert list(howell_source.pivots()) == [0]
residue_kernel = howell_source.right_kernel()
assert residue_kernel.base_ring() is R625
assert residue_kernel.degree() == 4
assert residue_kernel.rank() == 3
assert howell_source * residue_kernel.basis_matrix().T == (
    zero_matrix(R625, 3, 3)
)
assert howell_source.left_kernel().rank() == 1
assert howell_source.left_kernel().basis_matrix() * howell_source == (
    zero_matrix(R625, 1, 4)
)
assert howell_source.kernel() == howell_source.left_kernel()

set_random_seed(2026)
random_residue = random_matrix(R36, 4, 6)
set_random_seed(2026)
assert random_matrix(R36, 4, 6) == random_residue
assert all(value.parent() is R36 for value in random_residue.list())
try:
    matrix(ZZ, [[1, 2], [3]])
    assert False
except ValueError:
    pass

try:
    matrix(ZZ, [[1, 2], [2, 4]]).inverse()
    assert False
except ZeroDivisionError:
    pass

try:
    A * vector([1, 2, 3])
    assert False
except ValueError:
    pass

try:
    integer_kernel([1, 0, 0])
    assert False
except ValueError:
    pass
