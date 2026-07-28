# Placeholder for now -- nothing implemented

def exit(status=None):
    if status is None:
        status = 0
    elif not isinstance(status, int):
        print(status)
        status = 1
    process.exit(status)

argv = process.argv
byteorder = 'little'

# Node.js targets supported by Sage.js are 64-bit platforms.  Keep this exact
# even when this module is compiled by a bootstrap compiler whose own numeric
# literals are JavaScript Numbers.
maxsize = int('9223372036854775807')
