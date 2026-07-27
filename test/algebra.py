# globals: assrt, BigInt

# The parent/coercion kernel is independent of Sage literal preparsing.
assrt.ok(isinstance(ZZ, Parent))
assrt.ok(isinstance(QQ, Parent))
assrt.equal(parent(1), ZZ)
assrt.equal(parent(BigInt(2)), ZZ)
assrt.equal(parent(QQ(1, 3)), QQ)
R = PolynomialRing(ZZ, 'x')
assrt.equal(R, PolynomialRing(ZZ, 'x'))
assrt.equal(R.base_ring(), ZZ)
assrt.equal(R.variable_name(), 'x')
assrt.equal(repr(R),
            'Univariate Polynomial Ring in x over Integer Ring')

a = QQ(2, 1)
assrt.equal(repr(a), '2')
assrt.equal(repr(type(a)), "<class 'Rational'>")
assrt.equal(a.numerator(), 2)
assrt.equal(a.denominator(), 1)
assrt.ok(1 + a == QQ(3))
assrt.ok(a + 1 == QQ(3))
assrt.ok(a == 2)
assrt.ok(2 == a)
assrt.ok(QQ(2, 3) + QQ(1, 6) == QQ(5, 6))
assrt.ok(QQ(2, 3) - QQ(1, 6) == QQ(1, 2))
assrt.ok(QQ(2, 3) * QQ(9, 4) == QQ(3, 2))
assrt.ok(QQ(2, 3) / QQ(4, 9) == QQ(3, 2))
assrt.ok(QQ(2, -4) == QQ(-1, 2))
assrt.ok(abs(QQ(-2, 3)) == QQ(2, 3))
assrt.ok(QQ(2, 3) ** -2 == QQ(9, 4))

def zero_denominator():
    return QQ(1, 0)


assrt.throws(zero_denominator, ZeroDivisionError)
