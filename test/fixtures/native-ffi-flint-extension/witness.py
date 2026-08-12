import sagejs.runtime as runtime

from sagejs.ffi.flint import (
    fq_context,
    fq_polynomial,
    fq_polynomial_coordinate,
)
from sagejs.kernels.polynomial.extension_flint import (
    flint_extension_polynomial_coordinate_sum,
)


modulus = runtime.uint64_buffer([1, 0, 1])
coordinates = runtime.uint64_buffer([1, 2, 0, 1, 2, 2])
context = fq_context(modulus, 3, 3)
polynomial = fq_polynomial(context, coordinates, 6, 3)
assert flint_extension_polynomial_coordinate_sum(polynomial) == 8
assert fq_polynomial_coordinate(polynomial, 2, 1) == 2
context.close()
assert flint_extension_polynomial_coordinate_sum(polynomial) == 8
polynomial.close()
print("extension-resource-kernel-ok")
