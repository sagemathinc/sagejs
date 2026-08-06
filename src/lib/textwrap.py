"""Text wrapping helpers compatible with Python's :mod:`textwrap`.

This initial implementation provides the indentation operations most often
used by pure-Python libraries.  They deliberately operate line-by-line and
preserve line endings, matching CPython's public behavior.
"""


def _whitespace_prefix(line):
    index = 0
    while index < len(line) and line[index] in ' \t':
        index += 1
    return line[:index]


def dedent(text):
    """Remove indentation common to every non-blank line in *text*."""
    lines = text.splitlines(True)
    margin = None
    for line in lines:
        content = line.strip(' \t\r\n')
        if not content:
            continue
        prefix = _whitespace_prefix(line)
        if margin is None:
            margin = prefix
            continue
        length = min(len(margin), len(prefix))
        index = 0
        while index < length and margin[index] == prefix[index]:
            index += 1
        margin = margin[:index]
    if not margin:
        return ''.join('\n' if line.strip(' \t\r\n') == '' and line.endswith('\n')
                       else line for line in lines)
    result = []
    for line in lines:
        if line.strip(' \t\r\n') == '':
            result.append('\n' if line.endswith('\n') else '')
        elif line.startswith(margin):
            result.append(line[len(margin):])
        else:
            result.append(line)
    return ''.join(result)


def indent(text, prefix, predicate=None):
    """Add *prefix* to selected lines in *text*."""
    if predicate is None:
        predicate = lambda line: line.strip() != ''
    return ''.join(
        prefix + line if predicate(line) else line
        for line in text.splitlines(True)
    )
