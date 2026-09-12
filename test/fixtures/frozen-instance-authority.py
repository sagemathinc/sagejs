import sagejs.runtime as runtime


class Record:
    pass


class Other:
    pass


def rejected(action):
    failed = False
    try:
        action()
    except TypeError:
        failed = True
    assert failed


# Repeated failures must not publish dictionary authority or forget own fields.
frozen = Record()
frozen.value = 1
runtime.object.freeze(frozen)
for attempt in range(2):
    frozen_namespace = frozen.__dict__
    assert frozen_namespace is frozen.__dict__
    rejected(lambda: frozen_namespace.__setitem__("value", 9))
    rejected(lambda: setattr(frozen, "value", 9))
    assert frozen.value == 1
    assert runtime.reflect.get(frozen, "value") == 1
    assert "value" in dir(frozen)

# Nonextensible does not imply frozen: rejected exposure must preserve writable
# own fields and leave their tracking intact on every attempt.
nonextensible = Record()
nonextensible.value = 11
runtime.object.preventExtensions(nonextensible)
for attempt in range(2):
    rejected(lambda: getattr(nonextensible, "__dict__"))
    assert nonextensible.value == 11
    assert "value" in dir(nonextensible)
runtime.reflect.set(nonextensible, "value", 12)
assert nonextensible.value == 12

# Existing bridge storage must not permit changing a frozen object's class.
exposed = Record()
exposed.value = 2
alias = exposed.__dict__
runtime.object.freeze(exposed)
for attempt in range(2):
    rejected(lambda: object.__setattr__(exposed, "__class__", Other))
    rejected(lambda: setattr(exposed, "__dict__", {"value": 9}))
    rejected(lambda: delattr(exposed, "__dict__"))
    assert type(exposed) is Record
    assert exposed.__dict__ is alias
    assert exposed.value == 2

# Check every field before deleting any: a late nonconfigurable field must not
# cause an earlier configurable field to disappear on attempted exposure.
sealed_field = Record()
sealed_field.first = 3
sealed_field.last = 4
field_descriptor = runtime.object.create(None)
runtime.reflect.set(field_descriptor, "configurable", False)
runtime.object.defineProperty(sealed_field, "last", field_descriptor)
for attempt in range(2):
    rejected(lambda: getattr(sealed_field, "__dict__"))
    rejected(lambda: delattr(sealed_field, "last"))
    assert sealed_field.first == 3 and sealed_field.last == 4
    assert "first" in dir(sealed_field) and "last" in dir(sealed_field)

# Ordinary successful namespace transitions retain identity and alias rules.
ordinary = Record()
ordinary.value = 5
owned = ordinary.__dict__
owned["value"] = 6
assert ordinary.value == 6
replacement = {"value": 7}
ordinary.__dict__ = replacement
assert ordinary.__dict__ is replacement and ordinary.value == 7
owned["value"] = 8
assert ordinary.value == 7
object.__setattr__(ordinary, "__class__", Other)
assert type(ordinary) is Other and ordinary.__dict__ is replacement
del ordinary.__dict__
assert ordinary.__dict__ == {} and replacement == {"value": 7}
print("frozen-instance-authority-ok")
