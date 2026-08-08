"""Interpreter-side workloads matched by ``compare-native-cowasm.cjs``."""

import os
import sys
import time


source_root = os.environ.get('SAGEJS_NATIVE_SOURCE_ROOT')
if source_root:
    sys.path.insert(0, source_root)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cowasm', 'src'))

mode = os.environ.get('SAGEJS_NATIVE_COWASM_MODE', 'gcd')
count = int(os.environ.get('SAGEJS_NATIVE_COWASM_COUNT', '100000'))

if mode == 'gcd' or mode == 'large_gcd':
    from nt import gcd

    if mode == 'large_gcd':
        gcd_left = int(
            '13551125668563101951636936867148408377786010712418497242133543153221487310873528750612259354035717265300373778814347320257699257082356550045349914102924249595997483982228699287527241931811325095099642447621242200209254439920196960465321438498305345893378932585393381539093549479296194800838145996187122583354898000'
        )
        gcd_right = int(
            '21926181917556241406686103706309915958486962357677823319609567683411737103996154706784970805215687688521901419825115263702442945271943536926661440182594140777502197056285887176431805932352996517081429110551249721527408760372455849356040271478780238165116043293748873801451260758422788414440690362014196035679949001'
        )
    else:
        gcd_left = 92250
        gcd_right = 922350

    def workload():
        total = 0
        for index in range(count):
            total += gcd(gcd_left, gcd_right + (index if mode == 'gcd' else 0))
        return total
elif mode == 'rfib':
    from fib import rfib

    def workload():
        return rfib(count)
else:
    raise ValueError('unknown native CoWasm workload')

workload()
start = time.perf_counter()
answer = workload()
elapsed = time.perf_counter() - start
print('RESULT', answer, elapsed)
