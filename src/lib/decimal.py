"""Compact decimal-number compatibility surface.

This supplies the API shape needed by pure-Python libraries.  Values currently
use binary double precision; exact base-10 contexts and signals remain a
separate numerical-backend milestone.
"""


class Decimal:
    def __init__(self, value='0'):
        self._value = float(value)

    @classmethod
    def from_float(cls, value):
        return cls(value)

    def __float__(self):
        return self._value

    def __abs__(self):
        return Decimal(abs(self._value))

    def __add__(self, other):
        return Decimal(self._value + float(other))

    __radd__ = __add__

    def __sub__(self, other):
        return Decimal(self._value - float(other))

    def __rsub__(self, other):
        return Decimal(float(other) - self._value)

    def __mul__(self, other):
        return Decimal(self._value * float(other))

    __rmul__ = __mul__

    def __truediv__(self, other):
        return Decimal(self._value / float(other))

    def __eq__(self, other):
        try:
            return self._value == float(other)
        except (TypeError, ValueError):
            return False

    def __lt__(self, other):
        return self._value < float(other)

    def __le__(self, other):
        return self._value <= float(other)

    def __gt__(self, other):
        return self._value > float(other)

    def __ge__(self, other):
        return self._value >= float(other)

    def __repr__(self):
        return "Decimal('" + str(self._value) + "')"

    def __str__(self):
        return str(self._value)
