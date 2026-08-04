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

print(np.newaxis is None)
axis_view = a[np.newaxis, :, 1:3, None]
print(axis_view.shape, axis_view.ndim, axis_view.base is a.base)
axis_view[0, 1, 0, 0] = -7
print(a[1, 1])
a[2, 2] = 88
print(axis_view[0, 2, 1, 0])
print(a[None, ..., None].shape)
print(a[1, None, :, None].shape)
print(a[1, None, ..., None, 2:4].shape)
print(a[1, 2, None].shape, a[1, 2, None].tolist())

expanded = np.expand_dims(a, (0, -1))
print(expanded.shape, expanded.base is a.base)
expanded[0, 0, 0, 0] = 123
print(a[0, 0])

squeezed = np.squeeze(axis_view, axis=(0, 3))
print(squeezed.shape, squeezed.ndim, squeezed.base is a.base)
squeezed[2, 0] = -11
print(a[2].tolist())
print(axis_view.squeeze((0, 3)).shape)
print(a[:, None, :][1, 0, ::2].tolist())

scalar_array = np.squeeze(np.array([[[5]]]))
print(scalar_array.shape, scalar_array.ndim, scalar_array.item())

def error_name(function):
    try:
        function()
    except Exception as error:
        return type(error).__name__

print(error_name(lambda: a[..., ..., None]))
print(error_name(lambda: a[0, 0, 0]))
print(error_name(lambda: np.squeeze(a, axis=0)))
