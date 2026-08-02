"""Response helper classes used by urllib handlers."""

import io


class addbase:
    def __init__(self, fp):
        self.fp = fp

    def read(self, *values):
        return self.fp.read(*values)

    def readline(self, *values):
        return self.fp.readline(*values)

    def close(self):
        return self.fp.close()

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False


class addclosehook(addbase):
    def __init__(self, fp, closehook, *hookargs):
        addbase.__init__(self, fp)
        self.closehook = closehook
        self.hookargs = hookargs

    def close(self):
        if self.closehook is not None:
            self.closehook(*self.hookargs)
            self.closehook = None
        addbase.close(self)


class addinfo(addbase):
    def __init__(self, fp, headers):
        addbase.__init__(self, fp)
        self.headers = headers

    def info(self):
        return self.headers


class addinfourl(addinfo):
    def __init__(self, fp, headers, url, code=None):
        addinfo.__init__(self, fp, headers)
        self.url = url
        self.code = code

    @property
    def status(self):
        return self.code

    def getcode(self):
        return self.code

    def geturl(self):
        return self.url
