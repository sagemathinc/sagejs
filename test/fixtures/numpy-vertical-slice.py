import numpy as np


a = np.arange(12, dtype=np.int32).reshape(3, 4)
print(type(a).__name__)
print(a.dtype.name)
print(a.shape, a.ndim, a.size)
print(a[1].tolist())
print(a[-1, -1])
print(a[::-1].tolist())

view = a[:, 1:3]
view[0, 0] = 99
print(a.tolist())

print((a + 2).tolist())
print((2 - a).tolist())
print(a.sum(axis=0).tolist())
print(a.sum(axis=1, keepdims=True).tolist())
print((a > 8).tolist())

left = np.array([[1, 2], [3, 4]], dtype=np.int32)
right = np.array([[2], [1]], dtype=np.int32)
print((left @ right).tolist())

matrix = np.array([[1.5, 2.0], [3.0, 4.5]])
print(round(float(np.linalg.det(matrix)), 10))
print(repr(np.array([1, 2], dtype=np.int32)))
