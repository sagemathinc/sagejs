# sagejs-test-tier: portable
"""Sage-compatible global proof preferences and scoped restoration."""

expected = {
    "arithmetic": True,
    "elliptic_curve": True,
    "linear_algebra": True,
    "number_field": True,
    "other": True,
    "polynomial": True,
}
assert proof.all() == expected

assert proof.polynomial() is True
assert proof.polynomial(False) is None
assert proof.polynomial() is False
assert proof.arithmetic() is True
assert proof.other() is True

with proof.WithProof("polynomial", True):
    assert proof.polynomial() is True
assert proof.polynomial() is False

try:
    with proof.WithProof("polynomial", True):
        assert proof.polynomial() is True
        raise RuntimeError("restore the flag")
except RuntimeError:
    pass
assert proof.polynomial() is False

snapshot = proof.all()
snapshot["polynomial"] = True
assert proof.polynomial() is False

proof.all(False)
assert proof.all() == {
    "arithmetic": False,
    "elliptic_curve": False,
    "linear_algebra": False,
    "number_field": False,
    "other": False,
    "polynomial": False,
}
proof.all(True)
assert proof.all() == expected
