"""Python-shaped regular expressions backed by ECMAScript ``RegExp``.

Modern JavaScript supplies named groups, lookbehind, dot-all mode, and match
indices.  This module translates the small syntax differences and implements
Python's result objects and replacement rules in ordinary Python source.
"""

import sagejs.runtime as runtime


I = IGNORECASE = 2
L = LOCALE = 4
M = MULTILINE = 8
S = D = DOTALL = 16
U = UNICODE = 32
X = VERBOSE = 64
DEBUG = 128
A = ASCII = 256
T = TEMPLATE = 1
NOFLAG = 0
error = SyntaxError


def _replace_all(source, old, replacement):
    answer = ''
    while old in source:
        position = source.find(old)
        answer += source[:position] + replacement
        source = source[position + len(old):]
    return answer + source


def _property(value, name, fallback=None):
    answer = runtime.reflect.get(value, name)
    return fallback if answer is runtime.undefined else answer


def _verbose_source(source):
    answer = ''
    in_class = False
    escaped = False
    comment = False
    for character in source:
        if comment:
            if character == '\n':
                comment = False
            continue
        if escaped:
            answer += character
            escaped = False
            continue
        if character == '\\':
            answer += character
            escaped = True
            continue
        if character == '[':
            in_class = True
            answer += character
            continue
        if character == ']':
            in_class = False
            answer += character
            continue
        if not in_class and character == '#':
            comment = True
            continue
        if not in_class and character.isspace():
            continue
        answer += character
    return answer


def _transform(source, flags):
    source = str(source)
    # Detect an actual ``(?(id/name)yes|no)`` construct without mistaking an
    # escaped literal parenthesis followed by another group (``\(?(?P...``)
    # for one.  ECMAScript has no conditional-group equivalent.
    escaped = False
    in_class = False
    for position in range(len(source) - 2):
        character = source[position]
        if escaped:
            escaped = False
            continue
        if character == '\\':
            escaped = True
            continue
        if character == '[':
            in_class = True
            continue
        if character == ']':
            in_class = False
            continue
        if not in_class and source[position:position + 3] == '(?(':
            raise error('conditional groups are not supported')
    inline = {'i': IGNORECASE, 'm': MULTILINE, 's': DOTALL, 'x': VERBOSE}
    if source.startswith('(?'):
        close = source.find(')')
        if close > 2:
            prefix = source[2:close]
            if all(character in inline for character in prefix):
                for character in prefix:
                    flags |= inline[character]
                source = source[close + 1:]
    source = _replace_all(source, '(?P<', '(?<')
    # ECMAScript does not currently expose Python's scoped ASCII/Unicode mode
    # switch.  Its default Unicode behavior is the correct approximation for
    # these groups, and the surrounding non-capturing group preserves shape.
    source = _replace_all(source, '(?a:', '(?:')
    source = _replace_all(source, '(?u:', '(?:')
    source = _replace_all(source, '[]]', '[\\]]')
    source = _replace_all(source, '[^]]', '[^\\]]')
    answer = ''
    position = 0
    marker = '(?P='
    while True:
        start = source.find(marker, position)
        if start < 0:
            answer += source[position:]
            break
        answer += source[position:start] + '\\k<'
        close = source.find(')', start + len(marker))
        if close < 0:
            raise error('named group back-reference is not closed')
        answer += source[start + len(marker):close] + '>'
        position = close + 1
    source = _replace_all(answer, '\\A', '^')
    source = _replace_all(source, '\\Z', '$')
    # Python 3.11 possessive quantifiers have no ECMAScript spelling.  Dropping
    # the possessive suffix preserves the accepted language, though it may
    # permit additional backtracking.  Walk the pattern so escaped plus signs
    # and character classes remain untouched.
    answer = ''
    in_class = False
    escaped = False
    for character in source:
        if escaped:
            answer += character
            escaped = False
            continue
        if character == '\\':
            answer += character
            escaped = True
            continue
        if character == '[':
            in_class = True
        elif character == ']':
            in_class = False
        if (
            character == '+'
            and not in_class
            and len(answer) > 0
            and answer[-1] in ('*', '+', '?', '}')
        ):
            continue
        answer += character
    source = answer
    if flags & VERBOSE:
        source = _verbose_source(source)
    return source, flags


def _flag_text(flags, global_mode=True):
    answer = 'd'
    if global_mode:
        answer += 'g'
    if flags & IGNORECASE:
        answer += 'i'
    if flags & MULTILINE:
        answer += 'm'
    if flags & DOTALL:
        answer += 's'
    return answer


class MatchObject:
    def __init__(self, regex, native_match, position, end_position):
        self.re = regex
        self.string = str(_property(native_match, 'input', ''))
        self.pos = position
        self.endpos = end_position
        self._match = native_match
        self._indices = _property(native_match, 'indices')
        self.lastindex = None
        self.lastgroup = None
        for index in range(1, len(native_match)):
            if native_match[index] is not runtime.undefined:
                self.lastindex = index

    def _resolve(self, group):
        if isinstance(group, str):
            groups = _property(self._match, 'groups')
            if groups is None or groups is runtime.undefined:
                raise IndexError('no such group')
            value = _property(groups, group, runtime.undefined)
            if value is runtime.undefined:
                raise IndexError('no such group')
            indices = _property(self._indices, 'groups')
            pair = _property(indices, group, runtime.undefined)
            return value, pair
        index = int(group)
        if index < 0 or index >= len(self._match):
            raise IndexError('no such group')
        value = self._match[index]
        pair = self._indices[index]
        return value, pair

    def group(self, *groups):
        if not groups:
            groups = (0,)
        values = []
        for group in groups:
            value, unused = self._resolve(group)
            values.append(
                None
                if value is None or value is runtime.undefined
                else str(value))
        return values[0] if len(values) == 1 else tuple(values)

    __getitem__ = group

    def groups(self, fallback=None):
        answer = []
        for index in range(1, len(self._match)):
            value = self._match[index]
            answer.append(
                fallback
                if value is None or value is runtime.undefined
                else str(value))
        return tuple(answer)

    def groupdict(self, fallback=None):
        native = _property(self._match, 'groups')
        answer = {}
        if native is None or native is runtime.undefined:
            return answer
        keys = runtime.reflect.ownKeys(native)
        for key in keys:
            value = runtime.reflect.get(native, key)
            answer[str(key)] = (
                fallback
                if value is None or value is runtime.undefined
                else str(value))
        return answer

    def start(self, group=0):
        unused, pair = self._resolve(group)
        if pair is None or pair is runtime.undefined:
            return -1
        return int(pair[0])

    def end(self, group=0):
        unused, pair = self._resolve(group)
        if pair is None or pair is runtime.undefined:
            return -1
        return int(pair[1])

    def span(self, group=0):
        return (self.start(group), self.end(group))

    def expand(self, template):
        return _expand(template, self)

    def __bool__(self):
        return True


class RegexObject:
    def __init__(self, pattern, flags=0):
        self.pattern, self.flags = _transform(pattern, int(flags))

    def _native(self):
        return runtime.reflect.construct(
            runtime.regexp, [self.pattern, _flag_text(self.flags)])

    def search(self, string, pos=0, endpos=None):
        text = str(string)
        if endpos is None:
            endpos = len(text)
        target = text[:endpos]
        regex = self._native()
        runtime.reflect.set(regex, 'lastIndex', pos)
        native = runtime.reflect.apply(
            runtime.reflect.get(regex, 'exec'), regex, [target])
        if native is None:
            return None
        return MatchObject(self, native, pos, endpos)

    def match(self, string, pos=0, endpos=None):
        answer = self.search(string, pos, endpos)
        return answer if answer is not None and answer.start() == pos else None

    def fullmatch(self, string, pos=0, endpos=None):
        text = str(string)
        if endpos is None:
            endpos = len(text)
        answer = self.match(text, pos, endpos)
        return answer if answer is not None and answer.end() == endpos else None

    def finditer(self, string, pos=0, endpos=None):
        text = str(string)
        if endpos is None:
            endpos = len(text)
        answers = []
        cursor = pos
        while cursor <= endpos:
            match = self.search(text, cursor, endpos)
            if match is None:
                break
            answers.append(match)
            next_cursor = match.end()
            cursor = next_cursor + 1 if next_cursor == match.start() else next_cursor
        return iter(answers)

    def findall(self, string, pos=0, endpos=None):
        answer = []
        for match in self.finditer(string, pos, endpos):
            groups = match.groups('')
            if len(groups) == 0:
                answer.append(match.group())
            elif len(groups) == 1:
                answer.append(groups[0])
            else:
                answer.append(groups)
        return answer

    def split(self, string, maxsplit=0):
        text = str(string)
        answer = []
        position = 0
        splits = 0
        for match in self.finditer(text):
            if maxsplit and splits >= maxsplit:
                break
            answer.append(text[position:match.start()])
            answer.extend(match.groups())
            position = match.end()
            splits += 1
        answer.append(text[position:])
        return answer

    def subn(self, replacement, string, count=0):
        text = str(string)
        answer = ''
        position = 0
        replacements = 0
        for match in self.finditer(text):
            if count and replacements >= count:
                break
            answer += text[position:match.start()]
            answer += str(replacement(match) if callable(replacement)
                          else _expand(replacement, match))
            position = match.end()
            replacements += 1
        answer += text[position:]
        return answer, replacements

    def sub(self, replacement, string, count=0):
        return self.subn(replacement, string, count)[0]


Pattern = RegexObject
Match = MatchObject


def _expand(template, match):
    source = str(template)
    answer = ''
    position = 0
    escapes = {'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'v': '\v'}
    while position < len(source):
        character = source[position]
        if character != '\\' or position + 1 >= len(source):
            answer += character
            position += 1
            continue
        following = source[position + 1]
        if following == 'g' and position + 2 < len(source) and source[position + 2] == '<':
            close = source.find('>', position + 3)
            if close < 0:
                raise error('missing > in group name')
            name = source[position + 3:close]
            group = int(name) if name.isdigit() else name
            answer += match.group(group) or ''
            position = close + 1
        elif following.isdigit():
            end = position + 1
            while end < len(source) and source[end].isdigit():
                end += 1
            answer += match.group(int(source[position + 1:end])) or ''
            position = end
        elif following == '\\':
            answer += '\\'
            position += 2
        else:
            answer += escapes.get(following, following)
            position += 2
    return answer


_cache = {}


def compile(pattern, flags=0):
    if isinstance(pattern, RegexObject):
        if flags:
            raise ValueError('cannot process flags argument with a compiled pattern')
        return pattern
    if runtime.instance_of(pattern, runtime.regexp):
        pattern = _property(pattern, 'source')
    key = (str(pattern), int(flags))
    if key not in _cache:
        _cache[key] = RegexObject(pattern, flags)
    return _cache[key]


def search(pattern, string, flags=0):
    return compile(pattern, flags).search(string)


def match(pattern, string, flags=0):
    return compile(pattern, flags).match(string)


def fullmatch(pattern, string, flags=0):
    return compile(pattern, flags).fullmatch(string)


def split(pattern, string, maxsplit=0, flags=0):
    return compile(pattern, flags).split(string, maxsplit)


def findall(pattern, string, flags=0):
    return compile(pattern, flags).findall(string)


def finditer(pattern, string, flags=0):
    return compile(pattern, flags).finditer(string)


def sub(pattern, replacement, string, count=0, flags=0):
    return compile(pattern, flags).sub(replacement, string, count)


def subn(pattern, replacement, string, count=0, flags=0):
    return compile(pattern, flags).subn(replacement, string, count)


def escape(string):
    special = set('.^$*+?{}[]\\|()')
    return ''.join('\\' + character if character in special else character
                   for character in str(string))


def purge():
    _cache.clear()
