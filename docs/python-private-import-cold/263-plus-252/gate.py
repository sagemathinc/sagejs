from mpmath import mp
mp.dps = 30
print(mp.nstr(mp.sqrt(2), 20))
print(mp.nstr(mp.zeta(2), 20))
