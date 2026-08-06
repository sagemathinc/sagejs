# globals: assrt


def nothing():
    pass


assrt.equal(nothing(), undefined)


def add(a, b):
    return a + b


def sub(a, b):
    return a - b


mul = None


def nonlocal_test():
    nonlocal mul

    def mul0(a, b):
        return a * b

    mul = mul0

    def dev(a, b):  # noqa:unused-local
        return a / b


nonlocal_test()

assrt.equal(add(1, 2), 3)
assrt.equal(sub(1, 2), -1)
assrt.equal(mul(2, 2), 4)


class ReturnedCallable:
    def __call__(self, value=0):
        return value


def returned_callable():
    return ReturnedCallable()


assrt.equal(returned_callable()(value=7), 7)


# for some reason input to throws must be of type block, hence the 'def' wrapper
def divtest():
    div(6, 3)  # noqa: undef


assrt.throws(divtest, r"%js /div is not defined/")

arr = [8, 4]
assrt.equal(add(*arr), 12)
assrt.ok(Array.isArray(arr))


def sum(*args):
    ttl = 0
    for i in args:
        ttl += i
    return ttl


assrt.equal(sum(1, 2, 3), 6)
assrt.equal(sum(1, *[2, 3]), 6)

num = 4


def nonlocal_num():
    nonlocal num
    num = 5


nonlocal_num()
assrt.equal(num, 5)

x = "foo"
y = 5


def swap(x, y):
    return y, x


x, y = swap(x, y)
assrt.equal(x, 5)
assrt.equal(y, "foo")

count = 0


def inctest():
    def fake_increment():
        count += 1

    def real_increment():
        nonlocal count
        count += 1

    return fake_increment, real_increment


f, r = inctest()

f()
assrt.equal(count, 0)
r()
assrt.equal(count, 1)

st = "this is a string"
assrt.equal(jstype(st), r"%js typeof st")

# testing inlined functions
inlined = [
    def(x): return x+1;, def(x): return x+2;,
    def(x): return x+3;,
    def(x): return x+4;
]
assrt.equal(inlined[0](1), 2)
assrt.equal(inlined[1](1), 3)
assrt.equal(inlined[2](1), 4)
assrt.equal(inlined[3](1), 5)


# decorators
def makebold(fn):
    def wrapped(arg):
        return "<b>" + fn(arg) + "</b>"

    return wrapped


def makeitalic(fn):
    def wrapped(arg):
        return "<i>" + fn(arg) + "</i>"

    return wrapped


@makebold
@makeitalic
def hello(something):
    return "hello " + something


assrt.equal(hello("world"), "<b><i>hello world</i></b>")
assrt.equal(hello.__module__, '__main__')
assrt.equal(hello.__argnames__.length, 1)
assrt.equal(hello.__argnames__[0], 'arg')


def simple_wrapper(f):
    f.test_attr = 'test'
    return f


@simple_wrapper
def fw(x):
    pass


assrt.equal(fw.__module__, '__main__')
assrt.equal(fw.__argnames__.length, 1)
assrt.equal(fw.__argnames__[0], 'x')
# just because something is a reserved keyword in PyLang, doesn't mean other libraries won't attempt to use it
# let's make sure we parse that correctly
five = {}
r"%js five.is = function(n) { return 5 == n };"
assrt.ok(r"%js five.is(5)")

# function assignment via conditional
foo = (def(): return 5;) if 0 else (def(): return 6;)
bar = (def(): return 5;) if 0 < 1 else (def(): return 6;)
baz = (def():
    return 5
) if 1 else (def():
    return 6
)
assrt.equal(foo(), 6)
assrt.equal(bar(), 5)
assrt.equal(baz(), 5)


def trailing_comma(
    a,
    b,
):
    return a + b


assrt.equal(trailing_comma(1, 2), 3)
assrt.equal(trailing_comma(
    1,
    2,
), 3)


def tuple_default(value=(1, 2)):
    return value


assrt.deepEqual(tuple_default(), (1, 2))
assrt.deepEqual(tuple_default((3, 4)), (3, 4))


cached_calls = 0


@cached_function
def cached_add(left, right=0):
    nonlocal cached_calls
    cached_calls += 1
    return left + right


assrt.equal(cached_add(2, right=3), 5)
assrt.equal(cached_add(2, right=3), 5)
assrt.equal(cached_calls, 1)


class CachedCounter:
    def __init__(self):
        self.calls = 0

    @cached_method
    def twice(self, value):
        self.calls += 1
        return 2 * value


cached_counter = CachedCounter()
assrt.equal(cached_counter.twice(4), 8)
assrt.equal(cached_counter.twice(4), 8)
assrt.equal(cached_counter.calls, 1)

assrt.equal(is_prime(97), True)
assrt.equal(is_prime(1), False)
assrt.deepEqual(prime_range(10), [2, 3, 5, 7])
assrt.deepEqual(prime_range(10, 20), [11, 13, 17, 19])
assrt.deepEqual(prime_divisors(360), [2, 3, 5])
assrt.deepEqual(divisors(12), [1, 2, 3, 4, 6, 12])
assrt.equal(prod([2, 3, 5]), 30)
assrt.equal(prime_pi(100), 25)
assrt.equal(prime_pi(10**6), 78498)
assrt.equal(prime_pi(10**12), 37607912018)
assrt.equal(prime_pi(1000000.9), 78498)


def prime_pi_too_large():
    prime_pi(BigInt('9223372036854775808'))


assrt.throws(prime_pi_too_large, OverflowError)
assrt.equal(Integer(97).is_irreducible(), True)
assrt.equal(Integer(1).is_one(), True)
assrt.equal(Integer(2).is_one(), False)
assrt.equal(Integer(0).is_square(), True)
assrt.equal(Integer(144).is_square(), True)
assrt.equal(Integer(145).is_square(), False)
assrt.equal(Integer(-1).is_square(), False)
assrt.equal(
    BigInt("10000000000000000000000000000000000000000").is_square(),
    True,
)
assrt.equal(numerator(bernoulli(10)), 5)
assrt.equal(denominator(bernoulli(10)), 66)
assrt.deepEqual(
    [moebius(n) for n in range(10)],
    [0, 1, -1, -1, 0, -1, 1, -1, 0, 0])
assrt.deepEqual(
    moebius.range(3, 8),
    [-1, 0, -1, 1, -1])
assrt.ok(abs(zeta(2) - 1.6449340668482264) < 1e-15)
assrt.deepEqual(
    prime_powers(30),
    [1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 16, 17, 19,
     23, 25, 27, 29])
assrt.ok(is_prime_power(27))
assrt.ok(not is_prime_power(12))
assrt.deepEqual(
    list(cartesian_product_iterator([[1, 2], ['a', 'b']])),
    [(1, 'a'), (1, 'b'), (2, 'a'), (2, 'b')])
assrt.equal(latex(12), '12')


def return_string_with_newline():
    return '''a
b'''


assrt.equal(return_string_with_newline(), 'a\nb')


def conditionally_bound(flag):
    if flag:
        conditional_value = 10
    return conditional_value


def loop_bound(iterations):
    while iterations:
        loop_value = 20
        iterations -= 1
    return loop_value


assrt.equal(conditionally_bound(True), 10)
assrt.throws(def(): conditionally_bound(False);, NameError)
assrt.equal(loop_bound(1), 20)
assrt.throws(def(): loop_bound(0);, NameError)
# STAGE_ZERO_ONLY: historical RapydScript anonymous-function syntax
