# globals: assrt, BigInt

# The parent/coercion kernel is independent of Sage literal preparsing.
assrt.ok(isinstance(ZZ, Parent))
assrt.ok(isinstance(QQ, Parent))
assrt.equal(parent(1), ZZ)
assrt.equal(parent(BigInt(2)), ZZ)
assrt.equal(parent(QQ(1, 3)), QQ)
R = PolynomialRing(ZZ, 'x')
assrt.equal(R, PolynomialRing(ZZ, 'x'))
assrt.equal(R, ZZ.__getitem__('x'))
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

# Prime finite fields use JavaScript BigInt for cheap scalar arithmetic and
# FLINT nmod_poly for opaque native polynomial values.
F5 = GF(5)
assrt.ok(F5 is GF(5))
assrt.ok(F5 is FiniteField(5))
assrt.equal(repr(F5), 'Finite Field of size 5')
assrt.equal(repr(type(F5(-1))), "<class 'FiniteFieldElement'>")
assrt.equal(parent(F5(-1)), F5)
assrt.ok(F5(-1) == F5(4))
assrt.equal(F5(-1).lift(), 4)
assrt.ok(F5.gen() == F5(1))
assrt.equal(F5.order(), 5)
assrt.equal(F5.cardinality(), 5)
assrt.equal(F5.characteristic(), 5)
assrt.equal(F5.degree(), 1)
assrt.ok(F5.is_field())
assrt.ok(F5.is_finite())
assrt.ok(F5.is_prime_field())
assrt.equal(
    repr(type(F5)),
    "<class 'sage.rings.finite_rings.finite_field_prime_modn." +
    "FiniteField_prime_modn_with_category'>")
assrt.equal(repr(F5.construction()), '(QuotientFunctor, Integer Ring)')
assrt.ok(F5._first_ngens(1)[0] == F5(1))
assrt.equal(repr(F5.gens()), '(1,)')
assrt.equal(repr(F5.polynomial()), 'x')
assrt.equal(repr(list(F5)), '[0, 1, 2, 3, 4]')
assrt.ok(1 + F5(2) == F5(3))
assrt.ok(F5(2) + 1 == F5(3))
assrt.ok(F5(2) - 4 == F5(3))
assrt.ok(4 - F5(2) == F5(2))
assrt.ok(F5(2) * 4 == F5(3))
assrt.ok(F5(2) / 4 == F5(3))
assrt.ok(F5(2) ** -3 == F5(2))
assrt.ok(F5(QQ(1, 2)) == F5(3))
assrt.ok(F5(2) == 2)
assrt.ok(2 == F5(2))

def construct_non_prime_power_field():
    return GF(15)

def construct_extension_field():
    return GF(4)

def invalid_prime_field_generator():
    return F5.gen(1)

assrt.throws(construct_non_prime_power_field, ValueError)
assrt.throws(construct_extension_field, NotImplementedError)
assrt.throws(invalid_prime_field_generator, IndexError)

F1009_primitive = GF(1009, modulus='primitive')
assrt.ok(F1009_primitive is GF(1009, modulus='primitive'))
assrt.ok(F1009_primitive is not GF(1009))
assrt.ok(F1009_primitive.gen() == F1009_primitive(11))
assrt.equal(repr(F1009_primitive.gens()), '(11,)')

assrt.equal(next_prime(1000), 1009)
large_prime = next_prime(BigInt(2) ** BigInt(256))
assrt.equal(
    large_prime,
    BigInt(
        '115792089237316195423570985008687907853269984665640564039457584' +
        '007913129640233'))
large_field_iterator = iter(GF(large_prime))
assrt.equal(next(large_field_iterator).lift(), 0)
assrt.equal(next(large_field_iterator).lift(), 1)

finite_iterator = iter(GF(2))
assrt.equal(next(finite_iterator).lift(), 0)
assrt.equal(next(finite_iterator).lift(), 1)
assrt.equal(next(finite_iterator, 'finished'), 'finished')

def exhaust_prime_field_iterator():
    return next(finite_iterator)

assrt.throws(exhaust_prime_field_iterator, StopIteration)

def divide_by_zero_in_F5():
    return F5(1) / F5(0)

assrt.throws(divide_by_zero_in_F5, ZeroDivisionError)

F5x = PolynomialRing(F5, 'x')
F5x_again = PolynomialRing(GF(5), 'x')
assrt.ok(F5x is F5x_again)
assrt.ok(F5x is GF(5).__getitem__('x'))
assrt.ok(F5x is FiniteField(5).__getitem__('x'))
assrt.equal(
    repr(F5x),
    'Univariate Polynomial Ring in x over Finite Field of size 5')
assrt.equal(repr(type(F5x)), "<class 'PolynomialRingParent'>")
fx = F5x.gen()
ff = fx ** 4 - 1
fg = (fx - 1) ** 2 * (fx + 2)
assrt.equal(repr(ff), 'x^4 + 4')
assrt.equal(repr(ff.gcd(fg)), 'x^2 + x + 3')
assrt.equal(repr(gcd(ff, fg)), 'x^2 + x + 3')
assrt.ok((fx ** 2 + 2).is_irreducible())
assrt.equal(repr(ff.factor()),
            '(x + 1) * (x + 2) * (x + 3) * (x + 4)')
assrt.equal(parent(ff.factor().unit()), F5)
assrt.ok(ff.factor().value() == ff)
assrt.equal(repr(factor(ff)), repr(ff.factor()))
scaled_factorization = (2 * (fx + 1) ** 2).factor()
assrt.equal(repr(scaled_factorization), '2 * (x + 1)^2')
assrt.ok(scaled_factorization.unit() == F5(2))
assrt.ok(scaled_factorization.value() == 2 * (fx + 1) ** 2)
assrt.equal(repr(fg.roots()), '[(3, 1), (1, 2)]')
assrt.equal(repr(fg.roots(multiplicities=False)), '[3, 1]')

ZZx = PolynomialRing(ZZ, 'x')
assrt.equal(repr(F5x(ZZx.gen() + 7)), 'x + 2')
assrt.equal(parent((ZZx.gen() + 1) + F5(1)), F5x)

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
