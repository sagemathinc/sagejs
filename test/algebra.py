# globals: assrt, BigInt

# The parent/coercion kernel is independent of Sage literal preparsing.
assrt.ok(isinstance(ZZ, Parent))
assrt.ok(isinstance(QQ, Parent))
assrt.equal(parent(1), ZZ)
assrt.equal(parent(BigInt(2)), ZZ)
assrt.equal(parent(QQ(1, 3)), QQ)
assrt.equal(factorial(10), 3628800)
assrt.equal(binomial(10, 3), 120)
assrt.equal(binomial(-5, -1), 0)
assrt.equal(binomial(-5, 0), 1)
assrt.equal(binomial(-5, 1), -5)
assrt.equal(binomial(-5, 2), 15)
assrt.equal(binomial(-5, 8), 495)
assrt.equal(binomial(5, -1), 0)
assrt.equal(binomial(5, 7), 0)
huge_binomial_n = factorial(100)
assrt.equal(
    binomial(huge_binomial_n, 2),
    huge_binomial_n * (huge_binomial_n - 1) // 2,
)
assrt.equal(
    binomial(-huge_binomial_n, 2),
    huge_binomial_n * (huge_binomial_n + 1) // 2,
)
assrt.equal(valuation(2 ** 12 * 3, 2), 12)
assrt.deepEqual(xgcd(12, 15), (3, -1, 1))
assrt.equal(gcd([12, 18, 30]), 6)
multi_xgcd = xgcd([12, 18, 30])
assrt.equal(multi_xgcd[0], 6)
assrt.equal(
    sum(multi_xgcd[index + 1] * [12, 18, 30][index]
        for index in range(3)),
    6,
)
assrt.equal(inverse_mod(3, 4000), 2667)
assrt.equal(euler_phi(4000), 1600)
assrt.equal(sigma(28, 0), 6)
assrt.equal(sigma(28), 56)
assrt.equal(crt(2, 1, 3, 5), 11)
assrt.equal(crt([1, 0, 3, 1], [2, 3, 5, 7]), 183)
assrt.deepEqual(list(Partitions(5)), [
    [5], [4, 1], [3, 2], [3, 1, 1],
    [2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1],
])
R97 = IntegerModRing(97)
assrt.ok(R97(33).rational_reconstruction() == QQ(2, 3))
R = PolynomialRing(ZZ, 'x')
assrt.equal(R, PolynomialRing(ZZ, 'x'))
assrt.deepEqual(
    (R.gen() ** 2 + 2 * R.gen() + 3).coefficients(),
    [3, 2, 1],
)
assrt.equal((R.gen() ** 2 + 2 * R.gen() + 3)(4), 27)
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
assrt.equal(QQ(2, 3).n(), 2 / 3)
assrt.equal(QQ(2, 3).numerical_approx(digits=30), 2 / 3)
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
R12 = Zmod(12)
assrt.ok(R12 is Zmod(12))
assrt.ok(R12 is Integers(12))
assrt.ok(Mod(17, 12) == R12(5))
assrt.ok(Mod(-1, 12).parent() is R12)
assrt.equal(ZZ(Mod(-1, 12)), 11)
assrt.equal(ZZ(Mod(7, 12)), 7)
assrt.ok(Zmod(13) is not GF(13))
assrt.equal(str(R12), 'Ring of integers modulo 12')
assrt.equal(R12.order(), 12)
assrt.equal(R12.characteristic(), 12)
assrt.ok(R12.is_finite())
assrt.ok(not R12.is_field())
assrt.ok(Zmod(13).is_field())
assrt.ok(R12(8) + R12(9) == R12(5))
assrt.ok(R12(8) * R12(9) == R12(0))
assrt.ok(R12(5).is_unit())
assrt.ok(not R12(6).is_unit())
assrt.ok(R12(5).inverse_of_unit() == R12(5))
assrt.ok(~R12(5) == R12(5))
assrt.equal(R12(5).multiplicative_order(), 2)
assrt.equal(R12(5).order(), 2)
assrt.equal(Zmod(15)(2).multiplicative_order(), 4)
assrt.deepEqual([value.lift() for value in Zmod(8).unit_group()], [1, 3, 5, 7])
assrt.ok(sum(list(R12)) == R12(6))
assrt.ok(sum([R12(3), R12(5)], R12(2)) == R12(10))
assrt.ok(sum([R12(3), 2]) == R12(5))
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
f5_parent_method = f5_element.parent
assrt.ok(f5_parent_method() is F5)
assrt.ok(f5_parent_method.__self__ is f5_element)
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
assrt.equal(GF(11)(2).multiplicative_order(), 10)
assrt.equal(GF(11).multiplicative_generator().order(), 10)
assrt.ok(GF(2).multiplicative_generator() == GF(2)(1))
assrt.ok(GF(2)(1).sqrt() == GF(2)(1))
assrt.ok(GF(13)(10).sqrt() ** 2 == GF(13)(10))
assrt.ok(sqrt(GF(13)(10)) ** 2 == GF(13)(10))

modular_power_lookup = {GF(11)(1): 0}
assrt.ok(GF(11)(1) in modular_power_lookup)
modular_power_lookup[GF(11)(2) ** 3] = 3
assrt.equal(modular_power_lookup[GF(11)(8)], 3)

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
assrt.equal(power_mod(11, 156, 1237), 153)
assrt.equal(power_mod(3, -1, 7), 5)
assrt.deepEqual(prime_factors(60), [2, 3, 5])
assrt.equal(legendre_symbol(2, 7), 1)
assrt.equal(legendre_symbol(3, 7), -1)
small_random_prime = random_prime(30, lbound=20)
assrt.ok(is_prime(small_random_prime))
assrt.ok(20 <= small_random_prime <= 30)
assrt.equal(discrete_log(GF(101)(2) ** 37, GF(101)(2)), 37)
assrt.equal(discrete_log(GF(101)(2) ** 37, GF(101)(2), ord=200), 37)


def unavailable_discrete_log():
    discrete_log(GF(101)(2), GF(101)(4))


assrt.throws(unavailable_discrete_log, ValueError)
smooth_field = GF(1009, modulus='primitive')
smooth_generator = smooth_field.gen()
assrt.equal(
    discrete_log(smooth_generator ** 777, smooth_generator),
    777,
)
book_order = BigInt(
    '22974332779312916308087541215025543130953873335484909873')
book_prime = BigInt(2) * book_order + BigInt(1)
book_generator = Mod(3, book_prime)
book_target = Mod(
    BigInt(
        '117619616680834488747814058359345855076997576088312309'),
    book_prime,
)
assrt.equal(discrete_log(book_target, book_generator), 764093480249851)
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

F3t = PolynomialRing(GF(3), 't')
t3 = F3t.gen()
F9_custom = GF(9, 'u', modulus=t3 ** 2 + 1)
u9 = F9_custom.gen()
assrt.equal(repr(F9_custom.modulus()), 'x^2 + 1')
assrt.ok(u9 ** 2 == 2)
assrt.ok(GF(3)(2) + u9 == u9 + 2)
assrt.ok(F9_custom is GF(9, 'u', modulus=t3 ** 2 + 1))
assrt.ok(F9_custom is GF(9, 'u', modulus=2 * t3 ** 2 + 2))
F9_other = GF(9, 'u', modulus=t3 ** 2 + t3 + 2)
assrt.ok(F9_other is not F9_custom)
assrt.ok(F9_other is not GF(9, 'u'))
assrt.equal(repr(F9_other.modulus()), 'x^2 + x + 2')

ZZt = PolynomialRing(ZZ, 't')
integer_t = ZZt.gen()
assrt.ok(
    GF(9, 'v', modulus=integer_t ** 2 + 1).gen() ** 2 == 2)

def construct_reducible_extension():
    return GF(9, 'r', modulus=t3 ** 2 + 2)

def construct_wrong_degree_extension():
    return GF(9, 'r', modulus=t3 ** 3 + t3 + 1)

def put_modulus_on_prime_field():
    return GF(3, modulus=t3 ** 2 + 1)

assrt.throws(construct_reducible_extension, ValueError)
assrt.throws(construct_wrong_degree_extension, ValueError)
assrt.throws(put_modulus_on_prime_field, ValueError)

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

F9x = F9.__getitem__('x')
assrt.ok(F9x is PolynomialRing(F9, 'x'))
assrt.equal(
    repr(F9x),
    'Univariate Polynomial Ring in x over ' +
    'Finite Field in a of size 3^2')
f9x = F9x.gen()
f9_polynomial = (f9x + a9) * (f9x + a9 + 1)
assrt.equal(
    repr(f9_polynomial),
    'x^2 + (2*a + 1)*x + 2*a + 1')
assrt.equal(
    repr(f9_polynomial.coefficients()),
    '[2*a + 1, 2*a + 1, 1]')
assrt.ok(
    f9_polynomial // (f9x + a9)
    == f9x + a9 + 1)
assrt.ok(
    f9_polynomial.gcd(f9x ** 9 - f9x)
    == f9_polynomial)
assrt.ok(not f9_polynomial.is_irreducible())
assrt.equal(
    repr(f9_polynomial.factor()),
    '(x + a) * (x + a + 1)')
assrt.ok(f9_polynomial.factor().unit() == F9(1))
assrt.ok(f9_polynomial.factor().value() == f9_polynomial)
assrt.equal(
    repr(f9_polynomial.roots()),
    '[(2*a, 1), (2*a + 2, 1)]')
assrt.equal(
    repr(f9_polynomial.roots(multiplicities=False)),
    '[2*a, 2*a + 2]')

ZZx = PolynomialRing(ZZ, 'x')
assrt.equal(repr(F5x(ZZx.gen() + 7)), 'x + 2')
assrt.equal(repr(F9x(ZZx.gen() ** 2 + 4)), 'x^2 + 1')
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
fraction = (qx ** 3 + 1) / (qx ** 2 - 17)
assrt.equal(repr(fraction), '(q^3 + 1)/(q^2 - 17)')
assrt.equal(
    repr(fraction.parent()),
    'Fraction Field of Univariate Polynomial Ring in q over Rational Field')
assrt.ok(fraction.numerator() == qx ** 3 + 1)
assrt.ok(fraction.denominator() == qx ** 2 - 17)
assrt.ok(fraction + 1 == (
    (qx ** 3 + qx ** 2 - 16) / (qx ** 2 - 17)))
assrt.ok(1 / (qx - 1) == QQx.fraction_field()(1, qx - 1))

M = PolynomialRing(QQ, 3, 'xyz')
x, y, z = M.gens()
assrt.equal(
    repr(M),
    'Multivariate Polynomial Ring in x, y, z over Rational Field')
assrt.ok(M is PolynomialRing(QQ, 3, 'xyz'))
assrt.deepEqual(M.variable_names(), ('x', 'y', 'z'))
assrt.equal(M.ngens(), 3)
f = (x + y) ** 3 - z
assrt.equal(
    repr(f),
    'x^3 + 3*x^2*y + 3*x*y^2 + y^3 - z')
assrt.equal(f.degree(x), 3)
assrt.equal(f.degree('z'), 1)
assrt.equal(f.total_degree(), 3)
assrt.equal(f.number_of_terms(), 5)
assrt.ok((f * x).gcd(f * y) == f)
assrt.ok((f * x) // f == x)
assrt.ok(f + QQ(1, 2) == QQ(1, 2) + f)
M2 = PolynomialRing(QQ, ['y', 'x', 'z'])
assrt.ok(M2.has_coerce_map_from(M))
assrt.equal(repr(M2(x)), 'x')
M3 = PolynomialRing(QQ, ['a', 'b', 'c'])
assrt.ok(not M3.has_coerce_map_from(M))
assrt.equal(repr(M3(x + y)), 'a + b')
assrt.throws(lambda: M3.coerce(x), TypeError)
fresh_QQ_ring = PolynomialRing(RationalField(), 2, 'uv')
u, v = fresh_QQ_ring.gens()
assrt.equal(repr((u + 2 * v) ** 2), 'u^2 + 4*u*v + 4*v^2')

F5xyz = PolynomialRing(GF(5), ['z0', 'z1', 'z2'])
z0, z1, z2 = F5xyz.gens()
assrt.equal(
    repr((z0 + 2 * z1) ** 2),
    'z0^2 + 4*z0*z1 + 4*z1^2')
assrt.equal(
    repr(PolynomialRing(GF(5), 3, 'xyz')),
    'Multivariate Polynomial Ring in x, y, z over Finite Field of size 5')
assrt.ok(not PolynomialRing(
    GF(7), ['z0', 'z1', 'z2']).has_coerce_map_from(F5xyz))
assrt.equal(
    repr(PolynomialRing(ZZ, ['y', 'x'])),
    'Multivariate Polynomial Ring in y, x over Integer Ring')

assrt.ok(GF(5)(GF(2)(1)) == GF(5)(1))
assrt.ok(GF(2)(GF(5)(2)) == GF(2)(0))

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
assrt.equal(repr(CDF), 'Complex Double Field')
zd = CDF(1, 2)
assrt.equal(parent(zd), CDF)
assrt.equal(zd.real(), 1.0)
assrt.equal(zd.imag(), 2.0)
assrt.equal(
    repr(Ei(zd)),
    '1.0421677081649356 + 3.7015014259378742*I')
assrt.deepEqual(
    [round(value, 10) for value in zeta_zeros(3)],
    [14.1347251417, 21.0220396388, 25.0108575801])
K = QuadraticField(-1)
i = K.gen()
assrt.equal(repr(i), '1*i')
assrt.equal(repr(i * i), '-1')
assrt.equal(repr(K(2, -3)), '2 - 3*i')
assrt.ok(len(K.primes_of_bounded_norm(20)) > 0)
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
