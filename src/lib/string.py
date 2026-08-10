"""Common string constants and formatting helpers from Python's stdlib."""

whitespace = " \t\n\r\v\f"
ascii_lowercase = "abcdefghijklmnopqrstuvwxyz"
ascii_uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ascii_letters = ascii_lowercase + ascii_uppercase
digits = "0123456789"
hexdigits = digits + "abcdef" + "ABCDEF"
octdigits = "01234567"
punctuation = r"""!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~"""
printable = digits + ascii_letters + punctuation + whitespace


def capwords(value, sep=None):
    return (sep or " ").join(word.capitalize() for word in value.split(sep))


class Template:
    """Perform ``$identifier`` and ``${identifier}`` substitutions."""

    delimiter = "$"
    idpattern = r"(?a:[_a-z][_a-z0-9]*)"
    braceidpattern = None
    flags = 0

    def __init__(self, template):
        self.template = template

    def _substitute(self, mapping, safe):
        text = self.template
        answer = ""
        index = 0
        while index < len(text):
            if text[index] != self.delimiter:
                answer += text[index]
                index += 1
                continue
            start = index
            index += 1
            if index < len(text) and text[index] == self.delimiter:
                answer += self.delimiter
                index += 1
                continue
            braced = index < len(text) and text[index] == "{"
            if braced:
                index += 1
            name_start = index
            while index < len(text) and (text[index] == "_" or text[index].isalnum()):
                index += 1
            name = text[name_start:index]
            if braced:
                if index >= len(text) or text[index] != "}":
                    if safe:
                        answer += text[start:index]
                        continue
                    raise ValueError("Invalid placeholder in string")
                index += 1
            if not name:
                if safe:
                    answer += self.delimiter
                    continue
                raise ValueError("Invalid placeholder in string")
            try:
                answer += str(mapping[name])
            except KeyError:
                if not safe:
                    raise
                answer += text[start:index]
        return answer

    def substitute(self, mapping=None, /, **keywords):
        values = {} if mapping is None else dict(mapping)
        values.update(keywords)
        return self._substitute(values, False)

    def safe_substitute(self, mapping=None, /, **keywords):
        values = {} if mapping is None else dict(mapping)
        values.update(keywords)
        return self._substitute(values, True)

    def is_valid(self):
        try:
            self.safe_substitute({})
            return True
        except ValueError:
            return False

    def get_identifiers(self):
        identifiers = []
        text = self.template
        index = 0
        while index < len(text):
            if text[index] != self.delimiter:
                index += 1
                continue
            index += 1
            if index < len(text) and text[index] == self.delimiter:
                index += 1
                continue
            braced = index < len(text) and text[index] == "{"
            if braced:
                index += 1
            start = index
            while index < len(text) and (text[index] == "_" or text[index].isalnum()):
                index += 1
            name = text[start:index]
            if name and name not in identifiers:
                identifiers.append(name)
            if braced and index < len(text) and text[index] == "}":
                index += 1
        return identifiers


class Formatter:
    """Small compatible facade over Python's built-in format machinery."""

    def format(self, format_string, /, *args, **keywords):
        return format_string.format(*args, **keywords)

    def vformat(self, format_string, args, kwargs):
        return format_string.format(*args, **kwargs)

    def get_value(self, key, args, kwargs):
        if isinstance(key, int):
            return args[key]
        return kwargs[key]

    def format_field(self, value, format_spec):
        return format(value, format_spec)

    def convert_field(self, value, conversion):
        if conversion == "s":
            return str(value)
        if conversion == "r":
            return repr(value)
        if conversion == "a":
            return ascii(value)
        raise ValueError("Unknown conversion specifier " + str(conversion))
