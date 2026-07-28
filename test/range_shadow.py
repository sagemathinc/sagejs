# globals: assrt


def fake_range(_stop):
    return [10, 20]


range = fake_range
seen = []
for value in range(2):
    seen.append(value)

assrt.deepEqual(seen, [10, 20])
