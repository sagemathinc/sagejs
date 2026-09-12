"""Callable instances must use instance, not class, descriptor binding."""

from functools import cached_property


class Receiver:
    def __get__(self, instance, owner=None):
        return self if instance is None else (instance, owner)


class DataReceiver(Receiver):
    def __set__(self, instance, value):
        instance.payload = value

    def __delete__(self, instance):
        del instance.payload


receiver = Receiver()
data_receiver = DataReceiver()


class Plain:
    receiver = receiver
    data_receiver = data_receiver

    def __init__(self):
        self.calls = 0

    @cached_property
    def cached(self):
        self.calls += 1
        return [self]


class Callable(Plain):
    def __call__(self):
        return self


class Inherited(Callable):
    pass


for cls in (Plain, Callable, Inherited):
    item = cls()
    assert cls.receiver is receiver
    assert cls.data_receiver is data_receiver
    assert item.receiver == (item, cls)
    assert item.data_receiver == (item, cls)
    item.receiver = 17
    assert item.receiver == 17
    del item.receiver
    assert item.receiver == (item, cls)
    # Instance dictionaries cannot shadow data descriptors.
    item.__dict__["data_receiver"] = 18
    assert item.data_receiver == (item, cls)
    item.data_receiver = 19
    assert item.payload == 19
    del item.data_receiver
    assert not hasattr(item, "payload")
    first = item.cached
    assert first == [item]
    assert item.cached is first
    assert item.calls == 1
    del item.cached
    assert item.cached == [item]
    assert item.calls == 2
    if cls is not Plain:
        assert item() is item

print("callable-descriptor-ok")
