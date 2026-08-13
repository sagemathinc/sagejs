import sagejs.runtime as runtime

from sagejs.ffi.flint import fq_context, fq_element, fq_polynomial
from sagejs.kernels.polynomial.extension_flint import (
    flint_extension_element_coordinate_sum,
    flint_extension_polynomial_add,
    flint_extension_polynomial_coordinate,
    flint_extension_polynomial_coordinate_sum,
)


modulus = runtime.uint64_buffer([1, 0, 1])
coordinates = runtime.uint64_buffer([1, 2, 0, 1, 2, 2])
context = fq_context(modulus, 3, 3)
element = fq_element(context, runtime.uint64_buffer([1, 2]), 2)
polynomial = fq_polynomial(context, coordinates, 6, 3)
other_context = fq_context(modulus, 3, 3)
other_polynomial = fq_polynomial(other_context, coordinates, 6, 3)
try:
    flint_extension_polynomial_add(polynomial, other_polynomial)
except TypeError:
    pass
else:
    raise AssertionError("distinct finite extension contexts were accepted")
other_polynomial.close()
other_context.close()
assert flint_extension_polynomial_coordinate_sum(polynomial) == 8
assert flint_extension_element_coordinate_sum(element) == 3
assert flint_extension_polynomial_coordinate(polynomial, 2, 1) == 2
for coefficient, basis in [(3, 0), (0, 2)]:
    try:
        flint_extension_polynomial_coordinate(polynomial, coefficient, basis)
    except IndexError:
        pass
    else:
        raise AssertionError("out-of-range extension coordinate was accepted")
context.close()
assert flint_extension_polynomial_coordinate_sum(polynomial) == 8
derived = flint_extension_polynomial_add(polynomial, polynomial)
assert flint_extension_polynomial_coordinate(derived, 2, 1) == 1
derived.close()
polynomial.close()
element.close()
print("extension-resource-kernel-ok")
