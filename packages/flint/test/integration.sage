a = factor(2026)
print(a)
print(a[0])
print(a.value())

b = factor(-360)
print(b)
print(b.unit())

R.<x> = ZZ[]
g = (1 + x) + 1/3
print(g)
print(parent(g))

K.<a> = GF(3^2)
print(K)
print(K.modulus())
print(a^2)
print(a^-1)
