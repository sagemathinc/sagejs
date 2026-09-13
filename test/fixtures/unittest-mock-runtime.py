import os
from unittest import mock


def add(left, right=0):
    return left + right


probe = mock.MagicMock()
probe(1, right=2)
probe.assert_called_once_with(1, right=2)
assert probe.call_args == mock.call(1, right=2)
probe.reset_mock()
probe.assert_not_called()

with mock.patch.dict(os.environ, {"SAGEJS_MOCK_PROBE": "present"}):
    assert os.environ["SAGEJS_MOCK_PROBE"] == "present"
assert "SAGEJS_MOCK_PROBE" not in os.environ

holder = type("Holder", (), {})()
holder.value = add
with mock.patch.object(holder, "value") as replacement:
    replacement(5)
    replacement.assert_called_once_with(5)
assert holder.value is add

assert mock.sentinel.example is mock.sentinel.example
assert mock.call(1) == mock.call(1)
assert mock.ANY == object()
