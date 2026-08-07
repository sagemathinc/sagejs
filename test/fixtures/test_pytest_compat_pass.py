"""Representative core-pytest compatibility tests executed by Sage.js CI."""

import pytest


@pytest.fixture
def offset():
    return 2


@pytest.mark.parametrize(('value', 'expected'), [(1, 3), (4, 6)])
def test_fixture_and_parametrize(offset, value, expected):
    assert offset + value == expected


def test_raises_and_match():
    with pytest.raises(ValueError, match='invalid value'):
        raise ValueError('invalid value 17')


def test_approx():
    assert 0.1 + 0.2 == pytest.approx(0.3)
