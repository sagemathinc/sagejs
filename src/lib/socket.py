"""Client-oriented socket compatibility through an explicit host capability.

The initial transport is a buffered request/response exchange. It supports
the common connect/sendall/recv pattern without exposing Node primitives to
Python code; persistent streaming can replace the backend later.
"""

import os
import io
import base64
import sagejs.runtime as runtime


AF_UNSPEC = 0
AF_INET = 2
AF_INET6 = 10
SOCK_STREAM = 1
SOCK_DGRAM = 2
IPPROTO_IP = 0
IPPROTO_TCP = 6
IPPROTO_UDP = 17
SHUT_RD = 0
SHUT_WR = 1
SHUT_RDWR = 2
SOL_SOCKET = 1
SO_REUSEADDR = 2
AI_PASSIVE = 1
AI_CANONNAME = 2
AI_NUMERICHOST = 4
NI_NUMERICHOST = 1
has_ipv6 = True


error = OSError


class timeout(OSError):
    pass


class herror(OSError):
    pass


class gaierror(OSError):
    pass


_default_timeout = None


def getdefaulttimeout():
    return _default_timeout


def setdefaulttimeout(value):
    global _default_timeout
    if value is not None and value < 0:
        raise ValueError('Timeout value out of range')
    _default_timeout = value


def gethostname():
    return os.uname().nodename


def getfqdn(name=''):
    return gethostname() if not name else name


def _lookup(host, family=0):
    try:
        result = os._host_call('dnsLookup', host, family)
    except OSError as exception:
        raise gaierror(str(exception))
    return os._property(result, 'address'), os._property(result, 'family')


def gethostbyname(hostname):
    return _lookup(hostname, 4)[0]


def gethostbyname_ex(hostname):
    address = gethostbyname(hostname)
    return runtime.math_tuple([hostname, [], [address]])


def getaddrinfo(
    host,
    port,
    family=0,
    type=0,
    proto=0,
    flags=0,
):
    del flags
    address, resolved_family = _lookup(host, 6 if family == AF_INET6 else 0)
    result_family = AF_INET6 if resolved_family == 6 else AF_INET
    socket_type = SOCK_STREAM if type == 0 else type
    protocol = IPPROTO_TCP if proto == 0 and socket_type == SOCK_STREAM else proto
    sockaddr = runtime.math_tuple([address, int(port)])
    if result_family == AF_INET6:
        sockaddr = runtime.math_tuple([address, int(port), 0, 0])
    return [runtime.math_tuple([
        result_family, socket_type, protocol, '', sockaddr,
    ])]


def getnameinfo(sockaddr, flags):
    del flags
    return runtime.math_tuple([sockaddr[0], str(sockaddr[1])])


def inet_aton(address):
    parts = address.split('.')
    if len(parts) != 4:
        raise OSError('illegal IP address string passed to inet_aton')
    values = []
    for part in parts:
        value = int(part)
        if value < 0 or value > 255:
            raise OSError('illegal IP address string passed to inet_aton')
        values.append(value)
    return bytes(values)


def inet_ntoa(packed_ip):
    data = bytes(packed_ip)
    if len(data) != 4:
        raise OSError('packed IP wrong length for inet_ntoa')
    return '.'.join(str(value) for value in data)


def htons(value):
    return ((value & 255) << 8) | ((value >> 8) & 255)


ntohs = htons


def htonl(value):
    return (
        ((value & 255) << 24)
        | ((value & 65280) << 8)
        | ((value >> 8) & 65280)
        | ((value >> 24) & 255)
    )


ntohl = htonl


class socket:
    def __init__(
        self,
        family=AF_INET,
        type=SOCK_STREAM,
        proto=0,
        fileno=None,
    ):
        if fileno is not None:
            raise NotImplementedError('fileno-based sockets are not supported')
        if type != SOCK_STREAM:
            raise NotImplementedError('the initial socket backend supports SOCK_STREAM')
        self.family = family
        self.type = type
        self.proto = proto
        self._timeout = _default_timeout
        self._address = None
        self._outgoing = bytearray()
        self._incoming = b''
        self._closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def _check(self):
        if self._closed:
            raise OSError('Bad file descriptor')

    def connect(self, address):
        self._check()
        self._address = runtime.math_tuple([address[0], int(address[1])])

    def connect_ex(self, address):
        try:
            self.connect(address)
            return 0
        except OSError as exception:
            return getattr(exception, 'errno', 1) or 1

    def getpeername(self):
        self._check()
        if self._address is None:
            raise OSError('Transport endpoint is not connected')
        return self._address

    def getsockname(self):
        return runtime.math_tuple(['0.0.0.0', 0])

    def settimeout(self, value):
        if value is not None and value < 0:
            raise ValueError('Timeout value out of range')
        self._timeout = value

    def gettimeout(self):
        return self._timeout

    def setblocking(self, flag):
        self._timeout = None if flag else 0.0

    def getblocking(self):
        return self._timeout != 0.0

    def send(self, data, flags=0):
        del flags
        self._check()
        data = bytes(data)
        self._outgoing.extend(data)
        return len(data)

    def sendall(self, data, flags=0):
        self.send(data, flags)

    def _exchange(self, maximum):
        if self._address is None:
            raise OSError('Transport endpoint is not connected')
        milliseconds = 30000 if self._timeout is None else max(
            1, int(self._timeout * 1000))
        try:
            result = os._host_call(
                'tcpExchange',
                self._address[0],
                self._address[1],
                list(self._outgoing),
                maximum,
                milliseconds,
            )
        except OSError as exception:
            if getattr(exception, 'errno', None) == 110:
                raise timeout(str(exception))
            raise
        self._outgoing = bytearray()
        self._incoming += base64.b64decode(os._property(result, 'body'))

    def recv(self, bufsize, flags=0):
        del flags
        self._check()
        if not self._incoming:
            self._exchange(bufsize)
        answer = self._incoming[:bufsize]
        self._incoming = self._incoming[bufsize:]
        return answer

    def recv_into(self, buffer, nbytes=0, flags=0):
        data = self.recv(len(buffer) if not nbytes else nbytes, flags)
        for index in range(len(data)):
            buffer[index] = data[index]
        return len(data)

    def makefile(
        self,
        mode='r',
        buffering=None,
        *,
        encoding=None,
        errors=None,
        newline=None,
    ):
        del buffering, newline
        if not self._incoming:
            self._exchange(16 * 1024 * 1024)
        if 'b' in mode:
            return io.BytesIO(self._incoming)
        return io.StringIO(self._incoming.decode(
            'utf8' if encoding is None else encoding,
            'strict' if errors is None else errors,
        ))

    def shutdown(self, how):
        del how

    def close(self):
        self._closed = True

    def detach(self):
        raise NotImplementedError('socket.detach is not supported')

    def fileno(self):
        return -1


SocketType = socket


def create_connection(address, timeout=_default_timeout, source_address=None, *, all_errors=False):
    del source_address, all_errors
    result = socket(AF_INET, SOCK_STREAM)
    result.settimeout(timeout)
    result.connect(address)
    return result
