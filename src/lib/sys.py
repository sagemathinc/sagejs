# Placeholder for now -- nothing implemented

def exit(status=None):
    if status is None:
        raise SystemExit
    raise SystemExit(status)

argv = process.argv
path = [process.cwd()]
byteorder = 'little'

# Node.js targets supported by Sage.js are 64-bit platforms.  Keep this exact
# even when this module is compiled by a bootstrap compiler whose own numeric
# literals are JavaScript Numbers.
maxsize = int('9223372036854775807')

# CPython exposes a descriptive implementation version here.  Code should
# generally use ``sys.version_info`` for feature checks, but ``version`` is a
# standard public attribute and must at least be a string.
version = 'Sage.js'
