"""JSON encoding and decoding with Python-compatible exact integers.

The implementation is deliberately portable Python instead of a thin wrapper
around `JSON.parse`: JavaScript's parser rounds integers above `2**53`,
which is unacceptable in a computer algebra system.
"""

import sagejs.runtime as runtime


def _is_integer(value):
    return isinstance(value, int) or runtime.is_exact_integer(value)


class JSONDecodeError(ValueError):
    def __init__(self, msg, doc, pos):
        self.msg = msg
        self.doc = doc
        self.pos = pos
        self.lineno = doc.count("\n", 0, pos) + 1
        line_start = doc.rfind("\n", 0, pos)
        self.colno = pos + 1 if line_start < 0 else pos - line_start
        ValueError.__init__(
            self,
            msg
            + ": line "
            + str(self.lineno)
            + " column "
            + str(self.colno)
            + " (char "
            + str(pos)
            + ")",
        )


def _escape_string(value, ensure_ascii):
    answer = '"'
    escapes = {
        '"': '\\"',
        "\\": "\\\\",
        "\b": "\\b",
        "\f": "\\f",
        "\n": "\\n",
        "\r": "\\r",
        "\t": "\\t",
    }
    for character in value:
        if character in escapes:
            answer += escapes[character]
            continue
        code = ord(character)
        if code < 32 or (ensure_ascii and code > 126):
            if code <= 65535:
                answer += "\\u" + hex(code)[2:].rjust(4, "0")
            else:
                code -= 65536
                high = 55296 + (code >> 10)
                low = 56320 + (code & 1023)
                answer += "\\u" + hex(high)[2:].rjust(4, "0")
                answer += "\\u" + hex(low)[2:].rjust(4, "0")
        else:
            answer += character
    return answer + '"'


def _float_text(value, allow_nan):
    if value != value:
        if not allow_nan:
            raise ValueError("Out of range float values are not JSON compliant")
        return "NaN"
    if value == runtime.number.POSITIVE_INFINITY:
        if not allow_nan:
            raise ValueError("Out of range float values are not JSON compliant")
        return "Infinity"
    if value == runtime.number.NEGATIVE_INFINITY:
        if not allow_nan:
            raise ValueError("Out of range float values are not JSON compliant")
        return "-Infinity"
    return repr(value)


class JSONEncoder:
    def __init__(
        self,
        skipkeys=False,
        ensure_ascii=True,
        check_circular=True,
        allow_nan=True,
        sort_keys=False,
        indent=None,
        separators=None,
        **_keywords,
    ):
        self.skipkeys = skipkeys
        self.ensure_ascii = ensure_ascii
        self.check_circular = check_circular
        self.allow_nan = allow_nan
        self.sort_keys = sort_keys
        self.indent = indent
        self.default_function = _keywords.pop("default", None)
        if separators is None:
            self.item_separator = "," if indent is None else ","
            self.key_separator = ": " if indent is None else ": "
        else:
            self.item_separator, self.key_separator = separators
        if isinstance(indent, int):
            self.indent_text = " " * indent
        elif isinstance(indent, str):
            self.indent_text = indent
        else:
            self.indent_text = None

    def default(self, value):
        if self.default_function is not None:
            return self.default_function(value)
        raise TypeError(
            "Object of type " + type(value).__name__ + " is not JSON serializable"
        )

    def _key(self, key):
        if isinstance(key, str):
            return key
        if key is True:
            return "true"
        if key is False:
            return "false"
        if key is None:
            return "null"
        if _is_integer(key):
            return str(key)
        if isinstance(key, float):
            return _float_text(key, self.allow_nan)
        if self.skipkeys:
            return None
        raise TypeError(
            "keys must be str, int, float, bool or None, not " + type(key).__name__
        )

    def _join(self, opening, closing, values, level):
        if len(values) == 0:
            return opening + closing
        if self.indent_text is None:
            return opening + self.item_separator.join(values) + closing
        prefix = self.indent_text * (level + 1)
        suffix = self.indent_text * level
        return (
            opening
            + "\n"
            + prefix
            + (self.item_separator + "\n" + prefix).join(values)
            + "\n"
            + suffix
            + closing
        )

    def _encode(self, value, markers, level):
        if value is None:
            return "null"
        if value is True:
            return "true"
        if value is False:
            return "false"
        if isinstance(value, str):
            return _escape_string(value, self.ensure_ascii)
        if _is_integer(value):
            return str(value)
        if isinstance(value, float):
            return _float_text(value, self.allow_nan)

        container = isinstance(value, (list, tuple, dict))
        marker = id(value)
        if container and self.check_circular:
            if marker in markers:
                raise ValueError("Circular reference detected")
            markers.add(marker)
        try:
            if isinstance(value, (list, tuple)):
                parts = [self._encode(item, markers, level + 1) for item in value]
                return self._join("[", "]", parts, level)
            if isinstance(value, dict):
                entries = []
                for key, item in value.items():
                    text_key = self._key(key)
                    if text_key is None:
                        continue
                    entries.append((text_key, item))
                if self.sort_keys:
                    entries.sort(key=lambda entry: entry[0])
                parts = [
                    _escape_string(key, self.ensure_ascii)
                    + self.key_separator
                    + self._encode(item, markers, level + 1)
                    for key, item in entries
                ]
                return self._join("{", "}", parts, level)
            return self._encode(self.default(value), markers, level)
        finally:
            if container and self.check_circular:
                markers.remove(marker)

    def encode(self, value):
        return self._encode(value, set(), 0)

    def iterencode(self, value):
        yield self.encode(value)


def dumps(obj, **keywords):
    cls = keywords.pop("cls", None)
    canonical_keywords = {
        "skipkeys",
        "ensure_ascii",
        "check_circular",
        "allow_nan",
        "sort_keys",
        "indent",
        "separators",
    }
    if (
        cls is None
        and keywords.get("sort_keys", False) is True
        and keywords.get("separators") == (",", ":")
        and keywords.get("skipkeys", False) is False
        and keywords.get("ensure_ascii", True) is True
        and keywords.get("check_circular", True) is True
        and keywords.get("indent") is None
        and set(keywords).issubset(canonical_keywords)
    ):
        encoded = runtime.canonical_json_exact(obj)
        if encoded is not None:
            return encoded
    encoder_class = JSONEncoder if cls is None else cls
    return encoder_class(**keywords).encode(obj)


def dump(obj, fp, **keywords):
    for chunk in (keywords.pop("cls", None) or JSONEncoder)(**keywords).iterencode(obj):
        fp.write(chunk)


class JSONDecoder:
    def __init__(
        self,
        object_hook=None,
        parse_float=None,
        parse_int=None,
        parse_constant=None,
        object_pairs_hook=None,
        strict=True,
        **_keywords,
    ):
        self.object_hook = object_hook
        self.parse_float = float if parse_float is None else parse_float
        self.parse_int = int if parse_int is None else parse_int
        self.parse_constant = parse_constant
        self.object_pairs_hook = object_pairs_hook
        self.strict = strict
        self.document = ""
        self.position = 0

    def _error(self, message, position=None):
        if position is None:
            position = self.position
        raise JSONDecodeError(message, self.document, position)

    def _skip_space(self):
        while (
            self.position < len(self.document)
            and self.document[self.position] in " \t\r\n"
        ):
            self.position += 1

    def _string(self):
        start = self.position
        self.position += 1
        answer = ""
        escapes = {
            '"': '"',
            "\\": "\\",
            "/": "/",
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
        }
        while self.position < len(self.document):
            character = self.document[self.position]
            self.position += 1
            if character == '"':
                return answer
            if character == "\\":
                if self.position >= len(self.document):
                    self._error("Unterminated string starting at", start)
                escape = self.document[self.position]
                self.position += 1
                if escape in escapes:
                    answer += escapes[escape]
                    continue
                if escape != "u":
                    self._error("Invalid \\escape", self.position - 1)
                if self.position + 4 > len(self.document):
                    self._error("Invalid \\uXXXX escape", self.position - 2)
                digits = self.document[self.position : self.position + 4]
                try:
                    code = int(digits, 16)
                except ValueError:
                    self._error("Invalid \\uXXXX escape", self.position - 2)
                self.position += 4
                if 55296 <= code <= 56319:
                    if self.document[self.position : self.position + 2] == "\\u":
                        low_digits = self.document[
                            self.position + 2 : self.position + 6
                        ]
                        try:
                            low = int(low_digits, 16)
                        except ValueError:
                            low = -1
                        if 56320 <= low <= 57343:
                            self.position += 6
                            code = 65536 + ((code - 55296) << 10) + low - 56320
                answer += chr(code)
                continue
            if self.strict and ord(character) < 32:
                self._error("Invalid control character at", self.position - 1)
            answer += character
        self._error("Unterminated string starting at", start)

    def _number(self):
        start = self.position
        if self.document[self.position] == "-":
            self.position += 1
        if self.position >= len(self.document):
            self._error("Expecting value", start)
        if self.document[self.position] == "0":
            self.position += 1
        else:
            if self.document[self.position] not in "123456789":
                self._error("Expecting value", start)
            while (
                self.position < len(self.document)
                and self.document[self.position].isdigit()
            ):
                self.position += 1
        floating = False
        if self.position < len(self.document) and self.document[self.position] == ".":
            floating = True
            self.position += 1
            digit_start = self.position
            while (
                self.position < len(self.document)
                and self.document[self.position].isdigit()
            ):
                self.position += 1
            if self.position == digit_start:
                self._error("Expecting delimiter")
        if self.position < len(self.document) and self.document[self.position] in "eE":
            floating = True
            self.position += 1
            if (
                self.position < len(self.document)
                and self.document[self.position] in "+-"
            ):
                self.position += 1
            digit_start = self.position
            while (
                self.position < len(self.document)
                and self.document[self.position].isdigit()
            ):
                self.position += 1
            if self.position == digit_start:
                self._error("Expecting delimiter")
        text = self.document[start : self.position]
        return self.parse_float(text) if floating else self.parse_int(text)

    def _array(self):
        self.position += 1
        answer = []
        self._skip_space()
        if self.position < len(self.document) and self.document[self.position] == "]":
            self.position += 1
            return answer
        while True:
            answer.append(self._value())
            self._skip_space()
            if self.position >= len(self.document):
                self._error("Expecting ',' delimiter")
            delimiter = self.document[self.position]
            self.position += 1
            if delimiter == "]":
                return answer
            if delimiter != ",":
                self._error("Expecting ',' delimiter", self.position - 1)
            self._skip_space()

    def _object(self):
        self.position += 1
        pairs = []
        self._skip_space()
        if self.position < len(self.document) and self.document[self.position] == "}":
            self.position += 1
        else:
            while True:
                if (
                    self.position >= len(self.document)
                    or self.document[self.position] != '"'
                ):
                    self._error("Expecting property name enclosed in double quotes")
                key = self._string()
                self._skip_space()
                if (
                    self.position >= len(self.document)
                    or self.document[self.position] != ":"
                ):
                    self._error("Expecting ':' delimiter")
                self.position += 1
                self._skip_space()
                pairs.append(runtime.math_tuple([key, self._value()]))
                self._skip_space()
                if self.position >= len(self.document):
                    self._error("Expecting ',' delimiter")
                delimiter = self.document[self.position]
                self.position += 1
                if delimiter == "}":
                    break
                if delimiter != ",":
                    self._error("Expecting ',' delimiter", self.position - 1)
                self._skip_space()
        if self.object_pairs_hook is not None:
            return self.object_pairs_hook(pairs)
        answer = dict(pairs)
        if self.object_hook is not None:
            return self.object_hook(answer)
        return answer

    def _constant(self, text, value):
        self.position += len(text)
        if self.parse_constant is not None:
            return self.parse_constant(text)
        return value

    def _value(self):
        self._skip_space()
        if self.position >= len(self.document):
            self._error("Expecting value")
        character = self.document[self.position]
        if character == '"':
            return self._string()
        if character == "[":
            return self._array()
        if character == "{":
            return self._object()
        if self.document.startswith("true", self.position):
            self.position += 4
            return True
        if self.document.startswith("false", self.position):
            self.position += 5
            return False
        if self.document.startswith("null", self.position):
            self.position += 4
            return None
        if self.document.startswith("NaN", self.position):
            return self._constant("NaN", runtime.number.NaN)
        if self.document.startswith("Infinity", self.position):
            return self._constant("Infinity", runtime.number.POSITIVE_INFINITY)
        if self.document.startswith("-Infinity", self.position):
            return self._constant("-Infinity", runtime.number.NEGATIVE_INFINITY)
        if character == "-" or character.isdigit():
            return self._number()
        self._error("Expecting value")

    def raw_decode(self, value, idx=0):
        if not isinstance(value, str):
            raise TypeError("the JSON object must be str, bytes or bytearray")
        self.document = value
        self.position = idx
        answer = self._value()
        return answer, self.position

    def decode(self, value):
        answer, end = self.raw_decode(value)
        self.position = end
        self._skip_space()
        if self.position != len(self.document):
            self._error("Extra data")
        return answer


def loads(value, **keywords):
    if isinstance(value, (bytes, bytearray)):
        value = bytes(value).decode("utf8")
    cls = keywords.pop("cls", None)
    decoder_class = JSONDecoder if cls is None else cls
    return decoder_class(**keywords).decode(value)


def load(fp, **keywords):
    return loads(fp.read(), **keywords)
