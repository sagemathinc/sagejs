"""Source-line cache used by dynamically generated Python code."""


cache = {}


def clearcache():
    cache.clear()


def getline(filename, lineno, module_globals=None):
    del module_globals
    lines = getlines(filename)
    if 1 <= lineno <= len(lines):
        return lines[lineno - 1]
    return ''


def getlines(filename, module_globals=None):
    del module_globals
    entry = cache.get(filename)
    if entry is not None:
        return entry[2]
    try:
        with open(filename, encoding='utf-8') as source:
            lines = source.readlines()
    except (OSError, IOError):
        return []
    cache[filename] = (sum(len(line) for line in lines), None, lines, filename)
    return lines


def checkcache(filename=None):
    del filename
