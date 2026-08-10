"""Base16, Base32, Base64, and URL-safe ASCII encodings."""

_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def _replace_all(text, old, replacement):
    answer = ""
    while old in text:
        position = text.find(old)
        answer += text[:position] + replacement
        text = text[position + len(old) :]
    return answer + text


def _bytes(value):
    if isinstance(value, str):
        return value.encode("ascii")
    return bytes(value)


def b64encode(value, altchars=None):
    data = _bytes(value)
    alphabet = _B64
    if altchars is not None:
        alternate = _bytes(altchars)
        if len(alternate) != 2:
            raise ValueError("altchars must be a bytes-like object of length 2")
        alphabet = alphabet[:62] + chr(alternate[0]) + chr(alternate[1])
    answer = ""
    for offset in range(0, len(data), 3):
        chunk = data[offset : offset + 3]
        value24 = 0
        for byte in chunk:
            value24 = (value24 << 8) | byte
        value24 <<= 8 * (3 - len(chunk))
        answer += alphabet[(value24 >> 18) & 63]
        answer += alphabet[(value24 >> 12) & 63]
        answer += alphabet[(value24 >> 6) & 63] if len(chunk) > 1 else "="
        answer += alphabet[value24 & 63] if len(chunk) > 2 else "="
    return answer.encode("ascii")


def standard_b64encode(value):
    return b64encode(value)


def urlsafe_b64encode(value):
    return b64encode(value, b"-_")


def b64decode(value, altchars=None, validate=False):
    text = _bytes(value).decode("ascii")
    alphabet = _B64
    if altchars is not None:
        alternate = _bytes(altchars)
        if len(alternate) != 2:
            raise ValueError("altchars must be a bytes-like object of length 2")
        text = _replace_all(text, chr(alternate[0]), "+")
        text = _replace_all(text, chr(alternate[1]), "/")
    cleaned = ""
    for character in text:
        if character in alphabet or character == "=":
            cleaned += character
        elif validate:
            raise ValueError("Only base64 data is allowed")
    if len(cleaned) % 4 != 0:
        raise ValueError("Incorrect padding")
    answer = bytearray()
    for offset in range(0, len(cleaned), 4):
        block = cleaned[offset : offset + 4]
        padding = block.count("=")
        value24 = 0
        for character in block:
            value24 <<= 6
            if character != "=":
                value24 |= alphabet.index(character)
        answer.append((value24 >> 16) & 255)
        if padding < 2:
            answer.append((value24 >> 8) & 255)
        if padding < 1:
            answer.append(value24 & 255)
    return bytes(answer)


def standard_b64decode(value):
    return b64decode(value)


def urlsafe_b64decode(value):
    data = _bytes(value)
    data += b"=" * (-len(data) % 4)
    return b64decode(data, b"-_")


def b16encode(value):
    digits = "0123456789ABCDEF"
    answer = ""
    for byte in _bytes(value):
        answer += digits[byte >> 4] + digits[byte & 15]
    return answer.encode("ascii")


def b16decode(value, casefold=False):
    text = _bytes(value).decode("ascii")
    if casefold:
        text = text.upper()
    if len(text) % 2:
        raise ValueError("Odd-length string")
    answer = bytearray()
    digits = "0123456789ABCDEF"
    for offset in range(0, len(text), 2):
        if text[offset] not in digits or text[offset + 1] not in digits:
            raise ValueError("Non-base16 digit found")
        answer.append(digits.index(text[offset]) * 16 + digits.index(text[offset + 1]))
    return bytes(answer)


def b32encode(value):
    data = _bytes(value)
    bits = 0
    count = 0
    answer = ""
    for byte in data:
        bits = (bits << 8) | byte
        count += 8
        while count >= 5:
            count -= 5
            answer += _B32[(bits >> count) & 31]
    if count:
        answer += _B32[(bits << (5 - count)) & 31]
    while len(answer) % 8:
        answer += "="
    return answer.encode("ascii")


def b32decode(value, casefold=False, map01=None):
    text = _bytes(value).decode("ascii")
    if casefold:
        text = text.upper()
    if map01 is not None:
        replacement = _bytes(map01).decode("ascii")
        text = _replace_all(text, "0", "O")
        text = _replace_all(text, "1", replacement)
    if len(text) % 8:
        raise ValueError("Incorrect padding")
    text = text.rstrip("=")
    bits = 0
    count = 0
    answer = bytearray()
    for character in text:
        if character not in _B32:
            raise ValueError("Non-base32 digit found")
        bits = (bits << 5) | _B32.index(character)
        count += 5
        if count >= 8:
            count -= 8
            answer.append((bits >> count) & 255)
    return bytes(answer)


encodebytes = b64encode
decodebytes = b64decode
