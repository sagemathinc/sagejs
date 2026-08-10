"""Exceptions raised by :mod:`urllib.request`."""


class URLError(OSError):
    def __init__(self, reason, filename=None):
        self.reason = reason
        self.filename = filename
        OSError.__init__(self, reason)

    def __str__(self):
        return "<urlopen error " + str(self.reason) + ">"


class HTTPError(URLError):
    def __init__(self, url, code, msg, hdrs, fp):
        self.url = url
        self.code = code
        self.msg = msg
        self.hdrs = hdrs
        self.headers = hdrs
        self.fp = fp
        URLError.__init__(self, msg, url)

    def __str__(self):
        return "HTTP Error " + str(self.code) + ": " + self.msg

    def read(self, *values):
        return self.fp.read(*values)

    def readline(self, *values):
        return self.fp.readline(*values)

    def close(self):
        return self.fp.close()


class ContentTooShortError(URLError):
    def __init__(self, message, content):
        self.content = content
        URLError.__init__(self, message)
