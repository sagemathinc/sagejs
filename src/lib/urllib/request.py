"""URL opening and retrieval through the Sage.js network capability."""

import os
import io
import base64
import tempfile

from urllib.parse import urlsplit, quote
from urllib.error import URLError, HTTPError, ContentTooShortError


__version__ = '3.14'


class _Headers:
    def __init__(self, pairs=()):
        self._pairs = [[str(name), str(value)] for name, value in pairs]

    def __contains__(self, name):
        return self.get(name) is not None

    def __getitem__(self, name):
        value = self.get(name)
        if value is None:
            raise KeyError(name)
        return value

    def get(self, name, fallback=None):
        normalized = name.lower()
        for key, value in reversed(self._pairs):
            if key.lower() == normalized:
                return value
        return fallback

    def get_all(self, name, failobj=None):
        normalized = name.lower()
        values = [value for key, value in self._pairs if key.lower() == normalized]
        return values if values else failobj

    def items(self):
        return [tuple(pair) for pair in self._pairs]

    def keys(self):
        return [pair[0] for pair in self._pairs]

    def values(self):
        return [pair[1] for pair in self._pairs]

    def get_content_type(self):
        return self.get('content-type', 'text/plain').split(';', 1)[0].strip().lower()

    def get_content_charset(self, failobj=None):
        content_type = self.get('content-type', '')
        for part in content_type.split(';')[1:]:
            if '=' in part:
                name, value = part.split('=', 1)
                if name.strip().lower() == 'charset':
                    return value.strip().strip('"').lower()
        return failobj

    def __repr__(self):
        return repr(dict(self._pairs))


class Request:
    def __init__(
        self,
        url,
        data=None,
        headers=None,
        origin_req_host=None,
        unverifiable=False,
        method=None,
    ):
        self.full_url = str(url)
        self.data = data
        self.headers = dict()
        self.unredirected_hdrs = dict()
        self.origin_req_host = origin_req_host
        self.unverifiable = unverifiable
        self.method = method
        if headers is not None:
            for key, value in headers.items():
                self.add_header(key, value)

    @property
    def type(self):
        return urlsplit(self.full_url).scheme

    @property
    def host(self):
        return urlsplit(self.full_url).netloc

    @property
    def selector(self):
        parsed = urlsplit(self.full_url)
        answer = parsed.path or '/'
        if parsed.query:
            answer += '?' + parsed.query
        return answer

    def get_full_url(self):
        return self.full_url

    def get_method(self):
        return self.method or ('POST' if self.data is not None else 'GET')

    def add_header(self, key, value):
        self.headers.__setitem__(str(key).capitalize(), str(value))

    def add_unredirected_header(self, key, value):
        self.unredirected_hdrs.__setitem__(str(key).capitalize(), str(value))

    def has_header(self, header_name):
        normalized = header_name.lower()
        return any(key.lower() == normalized for key in list(self.headers) + list(self.unredirected_hdrs))

    def get_header(self, header_name, fallback=None):
        normalized = header_name.lower()
        for mapping in (self.headers, self.unredirected_hdrs):
            for key, value in mapping.items():
                if key.lower() == normalized:
                    return value
        return fallback

    def remove_header(self, header_name):
        normalized = header_name.lower()
        for mapping in (self.headers, self.unredirected_hdrs):
            for key in list(mapping):
                if key.lower() == normalized:
                    mapping.__delitem__(key)

    def header_items(self):
        answer = dict(self.unredirected_hdrs)
        answer.update(self.headers)
        return list(answer.items())


class _HTTPResponse:
    def __init__(self, body, url, status, reason, headers):
        self._file = io.BytesIO(body)
        self.url = url
        self.status = status
        self.code = status
        self.reason = reason
        self.headers = _Headers(headers)
        self.msg = self.headers
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == b'':
            raise StopIteration
        return line

    def read(self, amount=None):
        return self._file.read(-1 if amount is None else amount)

    def read1(self, amount=-1):
        return self.read(amount)

    def readline(self, limit=-1):
        return self._file.readline(limit)

    def readlines(self, hint=-1):
        answer = []
        total = 0
        while True:
            line = self.readline()
            if line == b'':
                break
            answer.append(line)
            total += len(line)
            if hint > 0 and total >= hint:
                break
        return answer

    def info(self):
        return self.headers

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status

    def getheader(self, name, fallback=None):
        return self.headers.get(name, fallback)

    def getheaders(self):
        return self.headers.items()

    def close(self):
        self._file.close()
        self.closed = True


def _open(url, data=None, timeout=60, headers=None, method=None, raise_errors=True):
    request = url if isinstance(url, Request) else Request(
        url, data=data, headers=headers, method=method)
    if data is not None and isinstance(url, Request):
        request.data = data
    body = request.data
    if body is not None and not isinstance(body, (bytes, bytearray, memoryview)):
        raise TypeError('POST data should be bytes, an iterable of bytes, or a file object')
    header_items = request.header_items()
    if not request.has_header('User-Agent'):
        header_items.append(('User-Agent', 'Python-urllib/3.14 Sage.js'))
    if body is not None and not request.has_header('Content-Length'):
        header_items.append(('Content-Length', str(len(body))))
    try:
        result = os._host_call(
            'httpRequest',
            request.get_method(),
            request.full_url,
            [list(pair) for pair in header_items],
            None if body is None else list(bytes(body)),
            int(timeout * 1000),
        )
    except OSError as exception:
        raise URLError(exception)
    response = _HTTPResponse(
        base64.b64decode(os._property(result, 'body')),
        os._property(result, 'url', request.full_url),
        os._property(result, 'status', 0),
        os._property(result, 'reason', ''),
        os._property(result, 'headers', []),
    )
    if raise_errors and response.status >= 400:
        raise HTTPError(
            response.url,
            response.status,
            response.reason,
            response.headers,
            response,
        )
    return response


def urlopen(url, data=None, timeout=60, *, context=None):
    del context
    return _open(url, data, timeout)


class BaseHandler:
    pass


class ProxyHandler(BaseHandler):
    def __init__(self, proxies=None):
        self.proxies = {} if proxies is None else proxies


class HTTPPasswordMgr:
    def __init__(self):
        self.passwd = dict()

    def add_password(self, realm, uri, user, passwd):
        key = str(realm) + '\0' + str(uri)
        self.passwd.__setitem__(key, (user, passwd))

    def find_user_password(self, realm, authuri):
        key = str(realm) + '\0' + str(authuri)
        return self.passwd.get(key, (None, None))


class HTTPBasicAuthHandler(BaseHandler):
    def __init__(self, password_mgr=None):
        self.passwd = HTTPPasswordMgr() if password_mgr is None else password_mgr


class _OpenerDirector:
    def __init__(self, handlers=()):
        self.handlers = list(handlers)
        self.addheaders = [('User-agent', 'Python-urllib/3.14 Sage.js')]

    def add_handler(self, handler):
        self.handlers.append(handler)

    def open(self, fullurl, data=None, timeout=60):
        request = fullurl if isinstance(fullurl, Request) else Request(fullurl, data=data)
        for name, value in self.addheaders:
            if not request.has_header(name):
                request.add_header(name, value)
        return _open(request, data, timeout)


OpenerDirector = _OpenerDirector


def build_opener(*handlers):
    return _OpenerDirector(handlers)


_opener = None


def install_opener(opener):
    global _opener
    _opener = opener


def urlretrieve(url, filename=None, reporthook=None, data=None):
    response = urlopen(url, data)
    if filename is None:
        descriptor, filename = tempfile.mkstemp()
        os.close(descriptor)
    content = response.read()
    with open(filename, 'wb') as output:
        output.write(content)
    if reporthook is not None:
        reporthook(1, len(content), len(content))
    return filename, response.headers


def pathname2url(pathname):
    return quote(os.fspath(pathname))


def url2pathname(pathname):
    from urllib.parse import unquote
    return unquote(pathname)
