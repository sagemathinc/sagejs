import numpy as np


def rounded(value, digits=8):
    if isinstance(value, np.ndarray):
        return rounded(value.tolist(), digits)
    if isinstance(value, (list, tuple)):
        return [rounded(item, digits) for item in value]
    if isinstance(value, complex):
        return [round(value.real, digits), round(value.imag, digits)]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return round(float(value), digits)
    return value


a = np.arange(1, 13, dtype=np.float64).reshape(3, 4)
print(rounded(np.full((2, 3), 7, dtype=np.int32)))
print(rounded(np.eye(3, k=1, dtype=np.int32)))
print(rounded(np.diag(np.array([2, 3, 5]), k=-1)))
print(rounded(np.logspace(0, 3, 4)))
print(rounded(np.sqrt(a) + np.square(a) / 10))
print(rounded(np.maximum(a, 7)))
print(rounded(np.logical_and(a > 3, a < 8)))
print(rounded(np.mean(a, axis=1)))
print(rounded(np.prod(a, axis=0)))
print(rounded(np.std(a, axis=0, ddof=1)))
print(rounded(np.argmax(a, axis=1)))
print(rounded(np.cumsum(a, axis=1)))
print(rounded(np.concatenate((a[:, :2], a[:, 2:]), axis=1)))
print(rounded(np.stack((a[0], a[1]), axis=0)))
print(rounded(np.tile(np.array([1, 2]), (2, 3))))
print(rounded(np.flip(a, axis=1)))
print(rounded(np.sort(np.array([[3, 1, 2], [0, 5, 4]]), axis=1)))
print(rounded(np.argsort(np.array([30, 10, 20]))))
print(rounded(np.nonzero(np.array([[0, 1], [2, 0]]))))
print(rounded(np.where(a % 2 == 0, a, -a)))
print(rounded(np.dot(a[0], a[1])))
print(rounded(np.kron(np.array([[1, 2]]), np.array([[1], [3]]))))

m = np.array([[4.0, 7.0], [2.0, 6.0]])
print(rounded(np.linalg.inv(m)))
print(rounded(np.linalg.solve(m, np.array([1.0, 0.0]))))
q, r = np.linalg.qr(m)
print(rounded(q @ r))
u, s, vh = np.linalg.svd(m)
print(rounded(u @ np.diag(s) @ vh))
print(np.linalg.matrix_rank(m))
print(rounded(np.linalg.norm(m)))
print(rounded(np.linalg.slogdet(m)))

spectrum = np.fft.fft(np.array([0.0, 1.0, 0.0, -1.0]))
print(rounded(spectrum))
print(rounded(np.fft.ifft(spectrum)))

with_nan = np.array([[1.0, np.nan, 3.0], [4.0, 5.0, np.nan]])
print(rounded(np.nanmean(with_nan, axis=1)))
print(rounded(np.nansum(with_nan, axis=0)))
values, indices, inverse, counts = np.unique(
    np.array([3, 1, 3, 2, 1]),
    return_index=True,
    return_inverse=True,
    return_counts=True,
)
print(rounded((values, indices, inverse, counts)))
print(rounded(np.append(np.array([1, 2]), [3, 4])))

np.random.seed(2026)
print(rounded(np.random.randint(0, 100, size=(2, 4))))
print(rounded(np.random.normal(1.5, 0.25, size=4)))
choices = np.random.choice(np.array([10, 20, 30]), size=5)
valid_choices = (choices >= 10) & (choices <= 30) & (choices % 10 == 0)
print([choices.shape, bool(np.all(valid_choices))])
