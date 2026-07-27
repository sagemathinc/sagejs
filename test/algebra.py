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

# These are the MPFR/MPC parents and display semantics used by SageMath.
assrt.ok(RealField(53) is RR)
assrt.ok(ComplexField(53) is CC)
assrt.equal(repr(RR), 'Real Field with 53 bits of precision')
assrt.equal(repr(CC), 'Complex Field with 53 bits of precision')
assrt.equal(RR.precision(), 53)
assrt.equal(CC.precision(), 53)

r = RR('1.2')
assrt.equal(parent(r), RR)
assrt.equal(repr(type(r)), "<class 'RealNumber'>")
assrt.equal(repr(r), '1.20000000000000')
assrt.equal(repr(RR(1) / RR(3)), '0.333333333333333')
assrt.equal(repr(RR(1) / RR(0)), '+infinity')
assrt.equal(repr(RR(2) ** -3), '0.125000000000000')

z = CC(1, 2)
assrt.equal(parent(z), CC)
assrt.equal(repr(type(z)), "<class 'ComplexNumber'>")
assrt.equal(repr(z), '1.00000000000000 + 2.00000000000000*I')
assrt.equal(repr(5j), '5.00000000000000*I')
assrt.equal(repr((1 + 1j) ** -2), '-0.500000000000000*I')

R100 = RealField(100)
C100 = ComplexField(100)
assrt.equal(
    repr(R100('1.2')), '1.2000000000000000000000000000')
# Sage's canonical maps intentionally go from higher precision to lower.
assrt.equal(parent(RR(1) + R100(2)), RR)
assrt.equal(parent(CC(1) + C100(2)), CC)
assrt.equal(parent(R100(1) + CC(2)), CC)
assrt.equal(parent(RR(1) + C100(2)), CC)
