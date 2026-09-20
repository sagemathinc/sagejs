events = []


class Plain:
    pass


plain = Plain()
plain.value = 1
plain.value = 2
assert plain.value == 2


class Descriptor:
    def __set__(self, instance, value):
        events.append(("descriptor", value))
        instance.descriptor_value = value


Plain.value = Descriptor()
plain.value = 3
assert events == [("descriptor", 3)]
assert plain.descriptor_value == 3
assert plain.__dict__["value"] == 2
del Plain.value
plain.value = 4
assert plain.value == 4


def class_setattr(self, name, value):
    events.append(("class", name, value))
    object.__setattr__(self, name, value)


Plain.__setattr__ = class_setattr
plain.value = 5
assert events[-1] == ("class", "value", 5)
del Plain.__setattr__
plain.value = 6
assert plain.value == 6


namespace = plain.__dict__
plain.value = 7
assert namespace["value"] == 7
replacement = {"value": 8}
plain.__dict__ = replacement
plain.value = 9
assert replacement["value"] == 9


class Other:
    pass


plain.__class__ = Other
plain.value = 10
assert type(plain) is Other and plain.value == 10


class ReadMutation:
    def __init__(self):
        self.value = 2


read_mutation = ReadMutation()
assert read_mutation.value == 2
assert read_mutation.value == 2


def changed_getattribute(self, name):
    value = object.__getattribute__(self, name)
    return value + 20 if name == "value" else value


ReadMutation.__getattribute__ = changed_getattribute
assert read_mutation.value == 22
del ReadMutation.__getattribute__
read_mutation.value = 3
assert read_mutation.value == 3
del read_mutation.value
try:
    read_mutation.value
except AttributeError:
    pass
else:
    raise AssertionError("deleted cached field remained readable")


order = []


def receiver(label):
    order.append(label)
    return plain


def right():
    order.append("right")
    return 11


receiver("first").left = receiver("second").right = right()
assert order == ["right", "first", "second"]
assert plain.left == plain.right == 11

print("setattr-cache-oracle-ok")
