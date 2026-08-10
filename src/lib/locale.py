"""Host-neutral locale helpers.

Sage.js source and terminal I/O are UTF-8.  Locale collation and monetary
formatting are deferred until a host locale service is exposed.
"""

LC_ALL = 6
LC_CTYPE = 0


def getencoding():
    return "UTF-8"


def getpreferredencoding(do_setlocale=True):
    del do_setlocale
    return "UTF-8"


def setlocale(category, locale=None):
    del category
    return "C.UTF-8" if locale is None else str(locale)
