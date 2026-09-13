import warnings


with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    warnings.warn("captured", DeprecationWarning)

assert len(caught) == 1
assert str(caught[0].message) == "captured"
assert caught[0].category is DeprecationWarning
