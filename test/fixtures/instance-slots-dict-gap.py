"""Known open compatibility defect; not part of the passing freeze regression."""


class Record:
    __slots__ = ("slot", "__dict__")


owner = Record()
owner.slot = 1
owner.extra = 2
print(owner.__dict__)
assert owner.__dict__ == {"extra": 2}
assert owner.slot == 1
print("instance-slots-dict-ok")
