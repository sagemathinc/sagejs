# globals: assrt

value = b"\x00abc\xff"
assrt.equal(repr(value), "b'\\x00abc\\xff'")
assrt.equal(value[1], 97)
assrt.equal(value[-1], 255)
assrt.deepEqual(list(value), [0, 97, 98, 99, 255])
assrt.ok(value + b"!" == b"\x00abc\xff!")
assrt.ok(2 * b"ab" == b"abab")
assrt.equal(bytes("abc", "utf-8").decode(), "abc")
assrt.equal(b"".decode("ascii"), "")
assrt.equal(b"plain ASCII\x00\x7f".decode("ascii"), "plain ASCII\x00\x7f")
assrt.equal(bytearray(b"mutable").decode("us-ascii"), "mutable")
assrt.equal(b"A\x80B\xffC".decode("ascii", "ignore"), "ABC")
assrt.equal(b"A\x80B\xffC".decode("ascii", "replace"), "A\ufffdB\ufffdC")
try:
    b"A\x80B".decode("ascii")
except UnicodeDecodeError as error:
    assrt.deepEqual(
        error.args,
        ("ascii", b"A\x80B", 1, 2, "ordinal not in range(128)"),
    )
else:
    raise AssertionError("invalid strict ASCII decode succeeded")
assrt.equal(b"valid".decode("ascii", "not-a-handler"), "valid")
try:
    b"\x80".decode("ascii", "not-a-handler")
except LookupError as error:
    assrt.equal(str(error), "unknown error handler name 'not-a-handler'")
else:
    raise AssertionError("unknown ASCII error handler succeeded")
assrt.deepEqual(b"a,b".split(b","), [b"a", b"b"])
unchanged = value.strip(b"z")
assrt.ok(unchanged is value)
assrt.equal(id(unchanged), id(value))

mutable = bytearray(b"abc")
mutable[1] = ord(b"Z")
mutable.append(33)
assrt.ok(mutable == bytearray(b"aZc!"))
assrt.ok(mutable[:2] == bytearray(b"aZ"))
mutable[1:3] = b"12"
assrt.ok(mutable == bytearray(b"a12!"))
