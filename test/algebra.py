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
assrt.ok(QQ(a) is a)
assrt.ok(Rational(a) == a)
assrt.equal(a.numerator(), 2)
assrt.equal(a.denominator(), 1)
assrt.equal(float(QQ(1, 4)), 0.25)
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
large_rational = QQ(
    BigInt(2) ** BigInt(200),
    BigInt(2) ** BigInt(100),
)
assrt.ok(
    large_rational == QQ(BigInt(2) ** BigInt(100)),
)

def zero_denominator():
    return QQ(1, 0)

def divide_by_zero():
    return QQ(1, 2) / QQ(0)


assrt.throws(zero_denominator, ZeroDivisionError)
assrt.throws(divide_by_zero, ZeroDivisionError)

# Prime finite fields use JavaScript BigInt for cheap scalar arithmetic and
# FLINT nmod_poly for opaque native polynomial values.
F5 = GF(5)
assrt.ok(F5 is GF(5))
assrt.ok(F5 is FiniteField(5))
assrt.ok(isinstance(F5, FiniteField_prime_modn))
assrt.ok(isinstance(F5, Parent))
assrt.equal(repr(F5), 'Finite Field of size 5')
assrt.equal(repr(type(F5(-1))), "<class 'FiniteFieldElement'>")
assrt.ok(isinstance(F5(-1), FiniteFieldElement))
assrt.ok(isinstance(F5(-1), Element))
assrt.equal(parent(F5(-1)), F5)
assrt.ok(F5(-1) == F5(4))
assrt.equal(F5(-1).lift(), 4)
f5_element = F5(2)
assrt.ok(F5(f5_element) is f5_element)
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

def invalid_prime_field_generator():
    return F5.gen(1)

assrt.throws(construct_non_prime_power_field, ValueError)
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

# Extension fields use FLINT Conway polynomials and keep their elements as
# opaque native fq values.
F9 = GF(9, 'a')
assrt.ok(F9 is GF(9, 'a'))
assrt.ok(F9 is not GF(9, 'b'))
assrt.ok(isinstance(F9, FiniteField_givaro))
assrt.ok(isinstance(F9, FiniteFieldExtensionParent))
assrt.ok(isinstance(F9, Parent))
assrt.equal(repr(F9), 'Finite Field in a of size 3^2')
assrt.equal(
    repr(type(F9)),
    "<class 'sage.rings.finite_rings.finite_field_givaro." +
    "FiniteField_givaro_with_category'>")
assrt.equal(F9.order(), 9)
assrt.equal(F9.cardinality(), 9)
assrt.equal(F9.characteristic(), 3)
assrt.equal(F9.degree(), 2)
assrt.ok(F9.is_field())
assrt.ok(F9.is_finite())
assrt.ok(not F9.is_prime_field())
assrt.ok(F9.prime_subfield() is GF(3))
assrt.equal(F9.variable_name(), 'a')
assrt.equal(repr(F9.modulus()), 'x^2 + 2*x + 2')
assrt.equal(repr(F9.polynomial()), 'a^2 + 2*a + 2')
assrt.equal(
    repr(F9.construction()),
    '(AlgebraicExtensionFunctor, Finite Field of size 3)')

a9 = F9.gen()
assrt.equal(repr(a9), 'a')
assrt.equal(parent(a9), F9)
assrt.ok(isinstance(a9, FiniteField_givaroElement))
assrt.ok(isinstance(a9, FiniteFieldExtensionElement))
assrt.ok(isinstance(a9, Element))
assrt.equal(
    repr(type(a9)),
    "<class 'sage.rings.finite_rings.element_givaro." +
    "FiniteField_givaroElement'>")
assrt.ok(F9._first_ngens(1)[0] == a9)
assrt.equal(repr(F9.gens()), '(a,)')
assrt.ok(a9 * a9 == a9 + 1)
assrt.ok(a9 - 1 == a9 + 2)
assrt.ok(-a9 == 2*a9)
assrt.ok(1 / a9 == a9 + 2)
assrt.ok(a9 ** -1 == a9 + 2)
assrt.ok(a9 ** 8 == 1)
assrt.ok(1 + a9 == a9 + 1)
assrt.ok(a9 + GF(3)(2) == a9 + 2)
assrt.ok(F9(QQ(1, 2)) == 2)
assrt.equal(
    repr(list(F9)),
    '[0, a, a + 1, 2*a + 1, 2, 2*a, 2*a + 2, a + 2, 1]')
assrt.equal(GF(9).variable_name(), 'z2')
assrt.equal(repr(GF(8, 'b').modulus()), 'x^3 + x + 1')

F65536 = GF(BigInt(2) ** BigInt(16), 'b')
assrt.equal(
    repr(type(F65536)),
    "<class 'sage.rings.finite_rings.finite_field_ntl_gf2e." +
    "FiniteField_ntl_gf2e_with_category'>")
assrt.equal(
    repr(type(F65536.gen())),
    "<class 'sage.rings.finite_rings.element_ntl_gf2e." +
    "FiniteField_ntl_gf2eElement'>")
assrt.equal(
    repr(F65536.modulus()),
    'x^16 + x^5 + x^3 + x^2 + 1')

F177147 = GF(BigInt(3) ** BigInt(11), 'c')
assrt.equal(
    repr(type(F177147)),
    "<class 'sage.rings.finite_rings.finite_field_pari_ffelt." +
    "FiniteField_pari_ffelt_with_category'>")
assrt.equal(
    repr(type(F177147.gen())),
    "<class 'sage.rings.finite_rings.element_pari_ffelt." +
    "FiniteFieldElement_pari_ffelt'>")
assrt.equal(repr(F177147.modulus()), 'x^11 + 2*x^2 + 1')

def divide_by_zero_in_F9():
    return a9 / F9(0)

def construct_extension_without_conway_polynomial():
    return GF(BigInt(65537) ** BigInt(2), 'a')

assrt.throws(divide_by_zero_in_F9, ZeroDivisionError)
assrt.throws(
    construct_extension_without_conway_polynomial,
    NotImplementedError)

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
zx = ZZx.gen()
integer_polynomial = (zx ** 2 - 1) * (zx ** 3 + 2) * (zx - 5)
assrt.equal(
    repr(integer_polynomial),
    'x^6 - 5*x^5 - x^4 + 7*x^3 - 10*x^2 - 2*x + 10')
assrt.equal(
    repr(integer_polynomial.factor()),
    '(x + 1) * (x - 1) * (x - 5) * (x^3 + 2)')
assrt.ok((zx ** 3 + 2).is_irreducible())
assrt.ok(not integer_polynomial.is_irreducible())
assrt.ok(integer_polynomial // (zx - 5) == (
    (zx ** 2 - 1) * (zx ** 3 + 2)))
assrt.equal(len(integer_polynomial.divisors()), 16)
assrt.ok((zx - 5) in integer_polynomial.divisors())

QQx = PolynomialRing(QQ, 'q')
qx = QQx.gen()
rational_polynomial = QQ(3, 10) * (qx - 1) ** 2 * (qx + 2)
assrt.equal(
    repr(rational_polynomial.factor()),
    '3/10 * (q + 2) * (q - 1)^2')
assrt.ok(rational_polynomial.factor().value() == rational_polynomial)
assrt.ok(rational_polynomial // (qx - 1) == (
    QQ(3, 10) * (qx - 1) * (qx + 2)))

# These are the MPFR/MPC parents and display semantics used by SageMath.
assrt.ok(RealField(53) is RR)
assrt.ok(ComplexField(53) is CC)
assrt.equal(
    repr(type(RR)),
    "<class 'sage.rings.real_mpfr.RealField_class'>")
assrt.equal(
    repr(type(CC)),
    "<class 'sage.rings.complex_mpfr." +
    "ComplexField_class_with_category'>")
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
