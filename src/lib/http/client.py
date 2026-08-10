"""Synchronous HTTP client compatibility over Sage.js host networking.

The first implementation buffers each response, matching the synchronous
surface of ``http.client`` while keeping Node and browser capabilities behind
the ordinary Python module boundary.
"""

from urllib.request import Request, _HTTPResponse, _open


HTTP_PORT = 80
HTTPS_PORT = 443
responses = {
    100: "Continue",
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    206: "Partial Content",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    413: "Content Too Large",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
}


class HTTPException(Exception):
    pass


class NotConnected(HTTPException):
    pass


class InvalidURL(HTTPException):
    pass


class UnknownProtocol(HTTPException):
    pass


class UnknownTransferEncoding(HTTPException):
    pass


class UnimplementedFileMode(HTTPException):
    pass


class IncompleteRead(HTTPException):
    def __init__(self, partial, expected=None):
        self.partial = partial
        self.expected = expected
        HTTPException.__init__(self, partial, expected)


class ImproperConnectionState(HTTPException):
    pass


class CannotSendRequest(ImproperConnectionState):
    pass


class CannotSendHeader(ImproperConnectionState):
    pass


class ResponseNotReady(ImproperConnectionState):
    pass


class BadStatusLine(HTTPException):
    pass


class LineTooLong(HTTPException):
    pass


class RemoteDisconnected(BadStatusLine):
    pass


HTTPResponse = _HTTPResponse


class HTTPConnection:
    default_port = HTTP_PORT
    _scheme = "http"

    def __init__(
        self, host, port=None, timeout=None, source_address=None, blocksize=8192
    ):
        del source_address
        if not host:
            raise InvalidURL("nonempty host required")
        self.host = str(host)
        self.port = self.default_port if port is None else int(port)
        self.timeout = 60 if timeout is None else timeout
        self.blocksize = blocksize
        self.sock = None
        self._method = None
        self._url = None
        self._headers = dict()
        self._body = None
        self._response = None

    def connect(self):
        self.sock = True

    def close(self):
        self.sock = None
        if self._response is not None:
            self._response.close()
        self._response = None

    def set_tunnel(self, host, port=None, headers=None):
        del host, port, headers
        raise NotImplementedError("HTTP CONNECT tunnels are not supported yet")

    def putrequest(self, method, url, skip_host=False, skip_accept_encoding=False):
        del skip_accept_encoding
        if self._method is not None:
            raise CannotSendRequest()
        self._method = str(method)
        self._url = str(url)
        self._headers = dict()
        if not skip_host:
            self._headers.__setitem__("Host", self.host)

    def putheader(self, header, *values):
        if self._method is None:
            raise CannotSendHeader()
        self._headers.__setitem__(
            str(header), "\r\n\t".join(str(value) for value in values)
        )

    def endheaders(self, message_body=None, *, encode_chunked=False):
        del encode_chunked
        self._body = message_body
        self._perform()

    def send(self, data):
        if self._body is None:
            self._body = data
        else:
            self._body += data

    def request(self, method, url, body=None, headers=None, *, encode_chunked=False):
        del encode_chunked
        self.putrequest(method, url)
        if headers is not None:
            for name, value in headers.items():
                self.putheader(name, value)
        self._body = body
        self._perform()

    def _perform(self):
        if self._method is None:
            raise CannotSendRequest()
        target = self._url
        if not target.startswith("http://") and not target.startswith("https://"):
            if not target.startswith("/"):
                target = "/" + target
            is_default_port = self.port == self.default_port
            authority = (
                self.host if is_default_port else self.host + ":" + str(self.port)
            )
            target = self._scheme + "://" + authority + target
        body = self._body
        if isinstance(body, str):
            body = body.encode("latin-1")
        request = Request(target, data=body, headers=self._headers, method=self._method)
        self._response = _open(request, timeout=self.timeout, raise_errors=False)
        self.sock = True
        self._method = None
        self._url = None
        self._headers = dict()
        self._body = None

    def getresponse(self):
        if self._response is None:
            raise ResponseNotReady()
        response = self._response
        self._response = None
        return response


class HTTPSConnection(HTTPConnection):
    default_port = HTTPS_PORT
    _scheme = "https"

    def __init__(
        self,
        host,
        port=None,
        *,
        timeout=None,
        source_address=None,
        context=None,
        blocksize=8192,
    ):
        del context
        HTTPConnection.__init__(self, host, port, timeout, source_address, blocksize)
