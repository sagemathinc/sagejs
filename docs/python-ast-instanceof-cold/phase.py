from time import perf_counter
print('PHASE before-import', flush=True)
start = perf_counter()
from mpmath import mp
print('PHASE imported', perf_counter() - start, flush=True)
mp.dps = 30
start = perf_counter()
root = mp.nstr(mp.sqrt(2), 20)
assert root == '1.4142135623730950488'
print('PHASE sqrt', perf_counter() - start, root, flush=True)
start = perf_counter()
value = mp.nstr(mp.zeta(2), 20)
assert value == '1.6449340668482264365'
print('PHASE zeta', perf_counter() - start, value, flush=True)
print('PHASE complete', flush=True)
