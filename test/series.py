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
