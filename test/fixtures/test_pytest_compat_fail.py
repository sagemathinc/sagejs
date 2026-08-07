"""Deliberately failing test used to verify pytest's exit status and report."""


def test_failure_is_reported():
    assert 2 + 2 == 5
