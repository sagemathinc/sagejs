# Test jsage language modifications

# ^ is xor in python by default
assrt.equal(2^3, 1)
assrt.equal(2**3, 8)
# note the precedence, despite how I wrote this!
assrt.equal(2^3 + 1, 2^4)

from __python__ import exponent
# now ^ is exponent and ^^ is xor
assrt.equal(2^3, 8)
assrt.equal(2^^3, 1)
assrt.equal(2**3, 8)

# ^ really **is** exponentiation, not xor, since the tokenizer does it.
# This means the precedence is correct (i.e., very high).
assrt.equal(2^3 + 1, 9)

# note that eval is not changed.  Maybe this is bad?
assrt.equal(eval('2^3'), 1)


from __python__ import no_exponent
# now ^ is back (and ^^ would be a syntax error - can't test this)
assrt.equal(2^3, 1)

# Ellipses range parsing
# Enable it:
from __python__ import ellipses

# With numerical literals
assrt.equal(str([1..5]), '[1, 2, 3, 4, 5]')

# With expressions
a = 2; b = 7
assrt.equal(str([a+a..b+2]), '[4, 5, 6, 7, 8, 9]')

# With a function call
def f(n):
    return n+1
assrt.equal(len([f(10)..f(1000)]), 991)

# With a floating point literal
assrt.equal(str([1.5..5]), '[1.5, 2.5, 3.5, 4.5]')

# Sage-compatible spelling and interpretation of numeric literals.
assrt.equal(042, 42)
assrt.equal(000042, 42)
assrt.equal(123_456, 123456)
assrt.equal(0b11_011, 27)
assrt.equal(0o76_321, 31953)
assrt.equal(0xaa_aaa, 699050)
assrt.equal(1_3.2_5e-2, 0.1325)
assrt.equal(87.toString(), '87')
assrt.equal(100r, 100)
assrt.equal(5L, 5)

# Numerical literals
from __python__ import numbers
# will parse all numbers as one less!
def Number(s):
    if s == '202693990283402830942083402834':
        return s
    return parseFloat(s) - parseFloat('1.0')
assrt.equal(2.5, parseFloat('1.5'))

# The number hook receives exact source text, even when JavaScript Number
# could not represent the literal.
assrt.equal(202693990283402830942083402834,
            '202693990283402830942083402834')
