"""Local diagnostic only: compare identical dictionary writes, not a benchmark gate."""

from time import perf_counter

import sagejs._namespace as namespace_module
import sagejs.runtime as runtime


class Record:
    pass


plain = {"value": 0}
unguarded_owner = Record()
unguarded = {"value": 0}
# Deliberate diagnostic-only private bypass constructs an otherwise identical
# exposed namespace without installing the candidate owner guard.
namespace_module._core.ρσ_bridge_instance_namespace(unguarded_owner)
namespace_module._core._builtins_instance_namespaces.set(unguarded_owner, unguarded)
guarded_owner = Record()
guarded_owner.value = 0
guarded = guarded_owner.__dict__
for control in (plain, unguarded):
    for storage in (control.keymap, control.jsmap):
        assert (
            runtime.object.getOwnPropertyDescriptor(storage, "set") is runtime.undefined
        )
assert (
    runtime.object.getOwnPropertyDescriptor(guarded.jsmap, "set")
    is not runtime.undefined
)


def measure(mapping):
    start = perf_counter()
    for index in range(10000):
        mapping["value"] = index
    assert mapping["value"] == 9999
    return (perf_counter() - start) * 1000


for warmup in range(3):
    for mapping in (plain, unguarded, guarded):
        measure(mapping)
for sample in range(7):
    print(measure(plain), measure(unguarded), measure(guarded))
assert unguarded_owner.value == 9999 and guarded_owner.value == 9999
