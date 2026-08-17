from __future__ import annotations


R = LaurentSeriesRing(QQ, "x")
x = R.gen()
assert str(R) == "Laurent Series Ring in x over Rational Field"
assert str(1 / (1 - x) + O(x**10)) == (
    "1 + x + x^2 + x^3 + x^4 + x^5 + x^6 + x^7 + x^8 + x^9 + O(x^10)"
)

S = PowerSeriesRing(GF(7), "T")
T = S.gen()
assert str(S) == "Power Series Ring in T over Finite Field of size 7"
assert PowerSeriesRing(GF(7), "T") is S

f = T + 3 * T**2 + T**3 + O(T**4)
assert str(f) == "T + 3*T^2 + T^3 + O(T^4)"
assert str(f**3) == "T^3 + 2*T^4 + 2*T^5 + O(T^6)"
assert str(1 / f) == "T^-1 + 4 + T + O(T^2)"
assert str(parent(1 / f)) == ("Laurent Series Ring in T over Finite Field of size 7")

assert str((1 + T + O(T**5)) * (1 - T + O(T**5))) == ("1 + 6*T^2 + O(T^5)")
assert str(O(T**3) * (T**2 + 1)) == "O(T^3)"
assert 1 + O(T**5) == 1
assert O(T**5) == 0
assert str(-x) == "-x"
assert f[0] == 0
assert f[1] == 1
assert f[3] == 1
assert f[4] == 0
assert f.precision_absolute() == 4
assert f.padded_list() == [0, 1, 3, 1]
assert str(f._inflate(2, 8)) == ("T^2 + 3*T^4 + T^6 + O(T^8)")
assert f._inflate(1) is f


P = PuiseuxSeriesRing(QQ, "y")
y = P.gen()
assert str(P) == "Puiseux Series Ring in y over Rational Field"
assert P.base_ring() is QQ
assert P.variable_name() == "y"
assert P.default_prec() == 20
assert str(y) == "y" and y is P.gen()
assert str(P.gens()) == "(y,)" and P.gens() is P.gens()
assert P.ngens() == 1
assert str(P.laurent_series_ring()) == ("Laurent Series Ring in y over Rational Field")
assert P.is_dense() and not P.is_sparse()
assert P.is_field() and P.fraction_field() is P
assert P.residue_field() is QQ and P.uniformizer() is y

try:
    P.gen(1)
except IndexError as error:
    assert str(error) == "generator 1 not defined"
else:
    raise AssertionError("accepted a second Puiseux generator")

A = PuiseuxSeriesRing(ZZ, "t", 30)
assert str(A.base_extend(QQ)) == "Puiseux Series Ring in t over Rational Field"
assert str(A.change_ring(QQ)) == "Puiseux Series Ring in t over Rational Field"
assert A.fraction_field().base_ring() is QQ
assert A.fraction_field().default_prec() == 30
assert not A.is_field()
integer_generator = A.gen()
integer_series = (
    integer_generator ** (-QQ(7) / 2)
    + 3
    + 5 * integer_generator ** (QQ(1) / 2)
    - 7 * integer_generator**3
)
assert str(integer_series) == "t^(-7/2) + 3 + 5*t^(1/2) - 7*t^3"
assert integer_series.is_unit()
for operation in (A.residue_field, A.uniformizer):
    try:
        operation()
    except TypeError as error:
        assert str(error) == "the base ring is not a field"
    else:
        raise AssertionError("nonfield Puiseux parent accepted a field operation")

N = PuiseuxSeriesRing(Zmod(4), "t")
try:
    N.fraction_field()
except ValueError as error:
    assert str(error) == "must be an integral domain"
else:
    raise AssertionError("non-domain Puiseux parent acquired a fraction field")

F = PuiseuxSeriesRing(GF(17), "x")
assert F.is_field() and str(F.residue_field()) == "Finite Field of size 17"
F3 = PuiseuxSeriesRing(GF(3), "v")
v = F3.gen()
finite_series = (v ** (-QQ(1) / 3) + 2 * v**3) ** 2
assert str(finite_series) == "v^(-2/3) + v^(8/3) + v^6"
assert finite_series.add_bigoh(7).precision_relative() == QQ(23) / 3
S_sparse = PuiseuxSeriesRing(QQ, "s", sparse=True)
assert S_sparse.is_sparse() and not S_sparse.is_dense()
assert S_sparse.laurent_series_ring().is_sparse()
assert str(S_sparse) == "Sparse Puiseux Series Ring in s over Rational Field"
L_sparse = LaurentSeriesRing(QQ, "u", sparse=True)
PL = PuiseuxSeriesRing(L_sparse)
assert PL.laurent_series_ring() is L_sparse
assert PL.is_sparse() and PL.variable_name() == "u"
assert PuiseuxSeriesRing(QQ, name="x") is PuiseuxSeriesRing(QQ, "x")

Q = PuiseuxSeriesRing(QQ, "q")
for target in (ZZ, GF(5), Zmod(4)):
    try:
        Q.base_extend(target)
    except TypeError as error:
        assert str(error) == "no valid base extension defined"
    else:
        raise AssertionError("accepted an invalid Puiseux base extension")
assert Q.base_extend(QQ) is Q
assert Q.change_ring(ZZ).base_ring() is ZZ
assert str(A.base_extend(GF(5))) == (
    "Puiseux Series Ring in t over Finite Field of size 5"
)

half = y ** (QQ(1) / 2)
assert str(half) == "y^(1/2)" and half.ramification_index() == 2
mixed = y ** (QQ(1) / 2) + y ** (QQ(1) / 3)
assert str(mixed) == "y^(1/3) + y^(1/2)"
assert mixed.ramification_index() == 6
assert [str(value) for value in mixed.exponents()] == ["1/3", "1/2"]
workflow = y ** (QQ(4) / 3) + y ** (-QQ(5) / 6)
assert str(workflow) == "y^(-5/6) + y^(4/3)"
assert workflow.ramification_index() == 6
assert str(workflow.add_bigoh(2)) == "y^(-5/6) + y^(4/3) + O(y^2)"
assert str(workflow.add_bigoh(1)) == "y^(-5/6) + O(y)"
adapted = (y ** (-QQ(1) / 3) + 2 * y ** (QQ(1) / 5)).add_bigoh(QQ(1) / 2)
assert str(adapted) == "y^(-1/3) + 2*y^(1/5) + O(y^(7/15))"
assert str(adapted.prec()) == "7/15"
assert adapted.variable() == "y"
assert adapted.common_prec(workflow.add_bigoh(2)) == QQ(7) / 15
assert (y ** (QQ(6) / 3)).ramification_index() == 1
assert str((y ** (QQ(1) / 2)) * (y ** (QQ(1) / 3))) == "y^(5/6)"
assert str((y ** (QQ(1) / 2)) + (y ** (QQ(1) / 2))) == "2*y^(1/2)"
assert P([1, 3, 5]).coefficients() == [QQ(1), QQ(3), QQ(5)]

lattice = 1 + y ** (QQ(1) / 2)
assert lattice.shift(QQ(1) / 3) == lattice
assert str(lattice.shift(QQ(1) / 2)) == "y^(1/2) + y"
assert lattice.shift(QQ(1) / 3).ramification_index() == 2
finite_monomial = y.add_bigoh(2)
powered = finite_monomial ** (QQ(2) / 3)
assert str(powered) == "y^(2/3) + O(y^(4/3))"
assert str(powered.prec()) == "4/3"
try:
    finite_monomial ** (-QQ(2) / 3)
except ValueError as error:
    assert str(error) == "For finite precision only positive arguments allowed"
else:
    raise AssertionError("accepted a negative rational power at finite precision")

non_laurent = y ** (QQ(1) / 2) - y ** (-QQ(1) / 2)
try:
    non_laurent.laurent_series()
except ArithmeticError as error:
    assert str(error) == "self is not a Laurent series"
else:
    raise AssertionError("fractional exponents converted to a Laurent series")
laurent_value = non_laurent**2
assert str(laurent_value.laurent_series()) == "y^-1 - 2 + y"
assert str((y + y**2).power_series()) == "y + y^2"
try:
    (y ** (-1)).power_series()
except ArithmeticError as error:
    assert str(error) == "self is not a power series"
else:
    raise AssertionError("negative exponents converted to a power series")

truncation_source = (y ** (-QQ(1) / 3) + 2 * y**3) ** 2
truncated = truncation_source.truncate(5)
assert str(truncated) == "y^(-2/3) + 4*y^(8/3)"
assert truncated == truncation_source.add_bigoh(5)

indexed = (y ** (QQ(1) / 2) + 2 * y ** (QQ(2) / 3)).add_bigoh(QQ(5) / 4)
assert indexed[QQ(1) / 2] == 1 and indexed[QQ(2) / 3] == 2
comparison = y ** (QQ(1) / 2) + y ** (QQ(1) / 3)
approximation = comparison.add_bigoh(QQ(1) / 2)
assert approximation == comparison
assert approximation != y ** (QQ(1) / 3)
assert (approximation - y ** (QQ(1) / 3)).is_zero()

invalid_zero_ramification = P([0, 1], e=0)
assert invalid_zero_ramification.ramification_index() == 0
assert str(invalid_zero_ramification.laurent_part()) == "y"
assert invalid_zero_ramification.list() == [1]
try:
    str(invalid_zero_ramification)
except ZeroDivisionError as error:
    assert str(error) == "rational division by zero"
else:
    raise AssertionError("accepted zero ramification")

for scalar in (P.gen(), QQ(1) / 2, 1, 0):
    constructed = P(scalar, e=0)
    assert constructed == P(scalar)
    assert constructed.ramification_index() == 1

try:
    mixed ** (QQ(1) / 2)
except ValueError as error:
    assert str(error) == "can only exponentiate single term by rational"
else:
    raise AssertionError("nonmonomial acquired a rational power")

from sage.rings.puiseux_series_ring_element import PuiseuxSeries

assert isinstance(y, PuiseuxSeries)
assert P.Element is PuiseuxSeries
