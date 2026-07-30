from __future__ import annotations


A = matrix(ZZ, 2, 2, [1, 2, 3, 4])
assert str(A) == '[1 2]\n[3 4]'
assert A.parent() is MatrixSpace(ZZ, 2)
assert A.base_ring() is ZZ
assert A.dimensions() == (2, 2)
assert A.list() == [1, 2, 3, 4]
assert A[0, 1] == 2
assert A[-1, -1] == 4
assert A[0] == vector(ZZ, [1, 2])
assert A.rows() == [vector([1, 2]), vector([3, 4])]
assert A.columns() == [vector([1, 3]), vector([2, 4])]

assert A.det() == -2
assert A.determinant() == -2
assert A.rank() == 2
assert A.transpose() == matrix(ZZ, [[1, 3], [2, 4]])
assert A.T == A.transpose()
assert A * A == matrix(ZZ, [[7, 10], [15, 22]])
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

huge = Integer(
    '1606938044258990275541962092341162602522202993782792835301499')
large = matrix(ZZ, [[huge, 1], [1, huge]])
assert large.det() == huge * huge - 1

assert zero_matrix(QQ, 2, 3) == matrix(QQ, 2, 3)
assert diagonal_matrix([2, 3, 5]) == matrix(
    ZZ, [[2, 0, 0], [0, 3, 0], [0, 0, 5]])
assert VectorSpace(QQ, 2)([1, 2]).parent() is VectorSpace(QQ, 2)
assert vector([1, 2, 3]).dot_product(vector([4, 5, 6])) == 32

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
