"""Lightweight token stream compatible with source-inspection consumers."""

import re


ENDMARKER = 0
NAME = 1
NUMBER = 2
STRING = 3
NEWLINE = 4
INDENT = 5
DEDENT = 6
OP = 54
ENCODING = 63


class TokenError(Exception):
    pass


class TokenInfo:
    def __init__(self, type, string, start, end, line):
        self.type = type
        self.string = string
        self.start = start
        self.end = end
        self.line = line

    def __iter__(self):
        return iter((self.type, self.string, self.start, self.end, self.line))

    def __getitem__(self, index):
        return (self.type, self.string, self.start, self.end, self.line)[index]


_TOKEN = re.compile(
    r"[A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)|"
    r"(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")|"
    r"==|!=|<=|>=|:=|->|\*\*|//|<<|>>|[^\s]")


def generate_tokens(readline):
    """Yield the five-field token tuples accepted by ``inspect.BlockFinder``."""
    lineno = 0
    indent_stack = [0]
    while True:
        try:
            line = readline()
        except StopIteration:
            line = ''
        if not line:
            break
        lineno += 1
        if isinstance(line, bytes):
            line = line.decode('utf-8')
        content = line.rstrip('\r\n')
        stripped = content.lstrip(' \t')
        indent = len(content) - len(stripped)
        if stripped and not stripped.startswith('#'):
            if indent > indent_stack[-1]:
                indent_stack.append(indent)
                yield TokenInfo(
                    INDENT, content[:indent], (lineno, 0),
                    (lineno, indent), line)
            while indent < indent_stack[-1]:
                indent_stack.pop()
                yield TokenInfo(
                    DEDENT, '', (lineno, indent), (lineno, indent), line)
        for match in _TOKEN.finditer(content):
            text = match.group(0)
            if text[0].isalpha() or text[0] == '_':
                kind = NAME
            elif text[0].isdigit() or (
                text[0] == '.' and len(text) > 1 and text[1].isdigit()
            ):
                kind = NUMBER
            elif text[0] in ('\'', '"'):
                kind = STRING
            else:
                kind = OP
            yield TokenInfo(
                kind, text, (lineno, match.start()),
                (lineno, match.end()), line)
        yield TokenInfo(
            NEWLINE, '\n', (lineno, len(content)),
            (lineno, len(content) + 1), line)
    while len(indent_stack) > 1:
        indent_stack.pop()
        yield TokenInfo(DEDENT, '', (lineno, 0), (lineno, 0), '')
    yield TokenInfo(ENDMARKER, '', (lineno + 1, 0), (lineno + 1, 0), '')


def tokenize(readline):
    first = readline()
    used = False

    def decoded_readline():
        nonlocal used
        if not used:
            used = True
            return first
        return readline()

    yield TokenInfo(ENCODING, 'utf-8', (0, 0), (0, 0), '')
    yield from generate_tokens(decoded_readline)


def detect_encoding(readline):
    first = readline()
    return 'utf-8', [first] if first else []
