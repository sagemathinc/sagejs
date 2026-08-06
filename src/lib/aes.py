"""AES block and authenticated modes backed by Node's audited crypto engine.

The public API is compatible with the original Sage.js AES module, but the
implementation is ordinary Python and reaches native crypto only through the
explicit :mod:`sagejs.runtime` boundary.  The backend is available in the CLI,
SEA binary, Jupyter kernel, and worker runtimes.
"""

import sagejs.runtime as runtime


number_of_rounds = {16: 10, 24: 12, 32: 14}
_crypto = runtime.require_module('node:crypto')
_buffer = runtime.reflect.get(runtime.global_object, 'Buffer')


class CipherResult:
    """Attribute-style result returned by the historical mode APIs."""

    def __init__(self, iv=None, cipherbytes=None, tag=None, counterbytes=None):
        self.iv = iv
        self.cipherbytes = cipherbytes
        self.tag = tag
        self.counterbytes = counterbytes


def _call(target, name, call_args=None):
    if call_args is None:
        call_args = []
    return runtime.reflect.apply(runtime.reflect.get(target, name), target, call_args)


def _native_bytes(value):
    values = [runtime.number(int(item) & 255) for item in value]
    return _call(_buffer, 'from', [values])


def _concat(values):
    return _call(_buffer, 'concat', [values])


def _copy(source, target, offset=0):
    for index in range(len(source)):
        target[offset + index] = source[index]
    return target


def _algorithm(key, mode):
    size = len(key)
    if size not in number_of_rounds:
        raise ValueError('invalid key size (must be length 16, 24 or 32)')
    return 'aes-' + str(size * 8) + '-' + mode


def _cipher(key, mode, iv, value, encrypt=True, aad=None, finish=True):
    factory = 'createCipheriv' if encrypt else 'createDecipheriv'
    cipher = _call(_crypto, factory, [
        _algorithm(key, mode), _native_bytes(key),
        None if iv is None else _native_bytes(iv),
    ])
    if mode in ('ecb', 'cbc'):
        _call(cipher, 'setAutoPadding', [False])
    if aad is not None:
        _call(cipher, 'setAAD', [_native_bytes(aad)])
    chunks = [_call(cipher, 'update', [_native_bytes(value)])]
    if finish:
        chunks.append(_call(cipher, 'final'))
    return _concat(chunks), cipher


def string_to_bytes(value):
    return str(value).encode('utf-8')


def bytes_to_string(value, offset=0):
    return bytes(value[offset:]).decode('utf-8')


def as_hex(value, sep=''):
    digits = '0123456789abcdef'
    pieces = []
    for item in value:
        byte = int(item) & 255
        pieces.append(digits[byte >> 4] + digits[byte & 15])
    return sep.join(pieces)


def random_bytes(size):
    return _call(_crypto, 'randomBytes', [size])


def generate_key(size):
    if size not in number_of_rounds:
        raise ValueError('Invalid key size, must be: 16, 24 or 32')
    return random_bytes(size)


def generate_tag(size=32):
    return random_bytes(size or 32)


def typed_array_as_js(value):
    return '(new Uint8Array([' + ','.join(str(item) for item in value) + ']))'


class AES:
    """AES block cipher supporting 128-, 192-, and 256-bit keys."""

    def __init__(self, key):
        self.key = bytes(key)
        _algorithm(self.key, 'ecb')

    def encrypt(self, plaintext, ciphertext, offset=0):
        block = plaintext[offset:offset + 16]
        output, unused = _cipher(self.key, 'ecb', None, block)
        return _copy(output, ciphertext, offset)

    def decrypt(self, ciphertext, plaintext, offset=0):
        block = ciphertext[offset:offset + 16]
        output, unused = _cipher(self.key, 'ecb', None, block, False)
        return _copy(output, plaintext, offset)

    def _words(self, words):
        answer = []
        for word in words:
            value = int(word)
            if value < 0:
                value += 1 << 32
            answer.extend([
                (value >> 24) & 255, (value >> 16) & 255,
                (value >> 8) & 255, value & 255,
            ])
        return answer

    def encrypt32(self, plaintext, ciphertext, offset=0):
        output, unused = _cipher(self.key, 'ecb', None, self._words(plaintext))
        return _copy(output, ciphertext, offset)

    def decrypt32(self, ciphertext, plaintext, offset=0):
        output, unused = _cipher(
            self.key, 'ecb', None, self._words(ciphertext), False)
        return _copy(output, plaintext, offset)


class ModeOfOperation:
    def __init__(self, key=None):
        self.key = bytes(key) if key is not None else bytes(generate_key(32))
        self.aes = AES(self.key)

    def tag_as_bytes(self, tag):
        if tag is None or tag is False or tag == '':
            return bytes()
        if isinstance(tag, str):
            return string_to_bytes(tag)
        return bytes(tag)


class CBC(ModeOfOperation):
    """Zero-padded AES-CBC compatible with the original Sage.js helper."""

    def encrypt_bytes(self, value, tag_bytes=None, iv=None):
        if tag_bytes is None:
            tag_bytes = bytes()
        if iv is None:
            iv = random_bytes(16)
        first_iv = bytes(iv)
        payload = self.tag_as_bytes(tag_bytes) + bytes(value)
        padding = (-len(payload)) % 16
        payload += bytes(padding)
        output, unused = _cipher(self.key, 'cbc', iv, payload)
        return CipherResult(iv=first_iv, cipherbytes=output)

    def decrypt_bytes(self, value, tag_bytes=None, iv=None):
        if tag_bytes is None:
            tag_bytes = bytes()
        if iv is None:
            raise ValueError('iv is required')
        output, unused = _cipher(self.key, 'cbc', iv, value, False)
        tag = self.tag_as_bytes(tag_bytes)
        if tag and as_hex(output[:len(tag)]) != as_hex(tag):
            raise ValueError('Corrupt message')
        return output[len(tag):]

    def encrypt(self, plaintext, tag=None):
        return self.encrypt_bytes(string_to_bytes(plaintext), self.tag_as_bytes(tag))

    def decrypt(self, encrypted, tag=None):
        output = self.decrypt_bytes(
            encrypted.cipherbytes, self.tag_as_bytes(tag), encrypted.iv)
        return bytes(output).rstrip(bytes([0])).decode('utf-8')


def _increment_counter(counter):
    answer = _native_bytes(counter)
    for index in range(len(answer) - 1, -1, -1):
        if answer[index] == 255:
            answer[index] = 0
        else:
            answer[index] += 1
            break
    return answer


class CTR(ModeOfOperation):
    def __init__(self, key=None, iv=None):
        super().__init__(key)
        if iv is None:
            iv = [0 for unused in range(16)]
        self.counter_block = bytes(iv)
        if len(self.counter_block) != 16:
            raise ValueError('iv must be 16 bytes long')

    def _crypt(self, value):
        output, unused = _cipher(
            self.key, 'ctr', self.counter_block, value, True)
        _copy(output, value)
        blocks = (len(value) + 15) // 16
        for unused_index in range(blocks):
            self.counter_block = bytes(_increment_counter(self.counter_block))
        return value

    def encrypt(self, plaintext, tag=None):
        tag_bytes = self.tag_as_bytes(tag)
        output = bytearray(tag_bytes + string_to_bytes(plaintext))
        counter = self.counter_block
        self._crypt(output)
        return CipherResult(cipherbytes=output, counterbytes=counter)

    def decrypt(self, encrypted, tag=None):
        saved = self.counter_block
        self.counter_block = encrypted.counterbytes
        output = bytearray(encrypted.cipherbytes)
        self._crypt(output)
        self.counter_block = saved
        tag_bytes = self.tag_as_bytes(tag)
        if tag_bytes and as_hex(output[:len(tag_bytes)]) != as_hex(tag_bytes):
            raise ValueError('Corrupted message')
        return bytes(output[len(tag_bytes):]).decode('utf-8')


class GCM(ModeOfOperation):
    def __init__(self, key, random_iv=False):
        super().__init__(key)
        self.random_iv = random_iv
        self.current_iv = _native_bytes([0 for unused in range(12)])

    def increment_iv(self):
        if all(value == 255 for value in self.current_iv):
            raise ValueError(
                'The GCM IV space is exhausted; this key cannot be reused')
        self.current_iv = _increment_counter(self.current_iv)

    def _encrypt_native(self, iv, plaintext, additional_data):
        output, cipher = _cipher(
            self.key, 'gcm', iv, plaintext, True, additional_data)
        tag = _call(cipher, 'getAuthTag')
        return output, tag

    def _crypt(self, iv, value, additional_data, decrypt):
        aad = bytes(additional_data)
        if decrypt:
            plaintext, unused = _cipher(
                self.key, 'gcm', iv, value, False, aad, False)
            verified_ciphertext, tag = self._encrypt_native(iv, plaintext, aad)
            if as_hex(verified_ciphertext) != as_hex(value):
                raise ValueError('Corrupted message')
            return CipherResult(
                iv=bytes(iv), cipherbytes=plaintext,
                tag=tag)
        ciphertext, tag = self._encrypt_native(iv, value, aad)
        return CipherResult(
            iv=bytes(iv), cipherbytes=ciphertext,
            tag=tag)

    def encrypt(self, plaintext, tag=None):
        if self.random_iv:
            iv = random_bytes(12)
        else:
            self.increment_iv()
            iv = self.current_iv
        return self._crypt(
            iv, string_to_bytes(plaintext), self.tag_as_bytes(tag), False)

    def decrypt(self, encrypted, tag=None):
        answer = self._crypt(
            encrypted.iv, encrypted.cipherbytes,
            self.tag_as_bytes(tag), True)
        if as_hex(answer.tag) != as_hex(encrypted.tag):
            raise ValueError('Corrupted message')
        return bytes(answer.cipherbytes).decode('utf-8')
