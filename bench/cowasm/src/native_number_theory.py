"""Typed AOT forms of the CoWasm exact-number microbenchmarks."""

from __future__ import annotations

from sagejs.native import native


@native
def native_gcd(a: Integer, b: Integer) -> Integer:
    while b:
        remainder = a % b
        a = b
        b = remainder
    return a


@native
def native_bench_gcd(iterations: uint64) -> Integer:
    """The ``numbers.py`` GCD workload with the loop inside native code."""
    total = 0
    for index in range(iterations):
        total += native_gcd(92250, 922350 + index)
    return total


@native
def native_bench_large_gcd(iterations: uint64) -> Integer:
    """Repeat Euclid on consecutive 1500th Fibonacci numbers."""
    total = 0
    for index in range(iterations):
        total += native_gcd(
            13551125668563101951636936867148408377786010712418497242133543153221487310873528750612259354035717265300373778814347320257699257082356550045349914102924249595997483982228699287527241931811325095099642447621242200209254439920196960465321438498305345893378932585393381539093549479296194800838145996187122583354898000,
            21926181917556241406686103706309915958486962357677823319609567683411737103996154706784970805215687688521901419825115263702442945271943536926661440182594140777502197056285887176431805932352996517081429110551249721527408760372455849356040271478780238165116043293748873801451260758422788414440690362014196035679949001,
        )
    return total


@native
def native_rfib(n: Integer) -> Integer:
    """The deliberately recursive Fibonacci workload from ``fib.py``."""
    if n == 1 or n == 0:
        return 1
    return native_rfib(n - 1) + native_rfib(n - 2)
