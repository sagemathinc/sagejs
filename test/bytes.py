# globals: assrt

value = b'\x00abc\xff'
assrt.equal(repr(value), "b'\\x00abc\\xff'")
assrt.equal(value[1], 97)
assrt.equal(value[-1], 255)
assrt.deepEqual(list(value), [0, 97, 98, 99, 255])
assrt.ok(value + b'!' == b'\x00abc\xff!')
assrt.ok(2 * b'ab' == b'abab')
assrt.equal(bytes('abc', 'utf-8').decode(), 'abc')
assrt.deepEqual(b'a,b'.split(b','), [b'a', b'b'])
unchanged = value.strip(b'z')
assrt.ok(unchanged is value)
assrt.equal(id(unchanged), id(value))

mutable = bytearray(b'abc')
mutable[1] = ord(b'Z')
mutable.append(33)
assrt.ok(mutable == bytearray(b'aZc!'))
assrt.ok(mutable[:2] == bytearray(b'aZ'))
mutable[1:3] = b'12'
assrt.ok(mutable == bytearray(b'a12!'))
