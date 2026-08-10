"""Portable URL parsing, joining, quoting, and query-string helpers."""

import sagejs.runtime as runtime


uses_relative = [
    "",
    "ftp",
    "http",
    "gopher",
    "nntp",
    "imap",
    "wais",
    "file",
    "https",
    "shttp",
    "mms",
    "prospero",
    "rtsp",
    "rtsps",
    "rtspu",
    "sftp",
    "svn",
    "svn+ssh",
    "ws",
    "wss",
]
uses_netloc = [
    "",
    "ftp",
    "http",
    "gopher",
    "nntp",
    "telnet",
    "imap",
    "wais",
    "file",
    "mms",
    "https",
    "shttp",
    "snews",
    "prospero",
    "rtsp",
    "rtsps",
    "rtspu",
    "rsync",
    "svn",
    "svn+ssh",
    "sftp",
    "nfs",
    "git",
    "git+ssh",
    "ws",
    "wss",
]
uses_params = [
    "",
    "ftp",
    "hdl",
    "prospero",
    "http",
    "imap",
    "https",
    "shttp",
    "rtsp",
    "rtsps",
    "rtspu",
    "sip",
    "sips",
    "mms",
    "sftp",
    "tel",
]


def _split_userinfo(netloc):
    if "@" not in netloc:
        return None, None, netloc
    userinfo, hostinfo = netloc.rsplit("@", 1)
    if ":" in userinfo:
        username, password = userinfo.split(":", 1)
    else:
        username, password = userinfo, None
    return unquote(username), None if password is None else unquote(password), hostinfo


def _host_port(netloc):
    _username, _password, hostinfo = _split_userinfo(netloc)
    if hostinfo.startswith("["):
        end = hostinfo.find("]")
        hostname = hostinfo[1:end]
        port_text = hostinfo[end + 1 :]
        port_text = port_text[1:] if port_text.startswith(":") else ""
    elif ":" in hostinfo:
        hostname, port_text = hostinfo.rsplit(":", 1)
    else:
        hostname, port_text = hostinfo, ""
    port = None
    if port_text:
        try:
            port = int(port_text)
        except ValueError:
            raise ValueError(
                "Port could not be cast to integer value as " + repr(port_text)
            )
        if port < 0 or port > 65535:
            raise ValueError("Port out of range 0-65535")
    return hostname.lower() if hostname else None, port


class SplitResult:
    def __init__(self, scheme, netloc, path, query, fragment):
        self.scheme = scheme
        self.netloc = netloc
        self.path = path
        self.query = query
        self.fragment = fragment

    @property
    def username(self):
        return _split_userinfo(self.netloc)[0]

    @property
    def password(self):
        return _split_userinfo(self.netloc)[1]

    @property
    def hostname(self):
        return _host_port(self.netloc)[0]

    @property
    def port(self):
        return _host_port(self.netloc)[1]

    def __len__(self):
        return 5

    def __getitem__(self, index):
        return runtime.math_tuple(
            [
                self.scheme,
                self.netloc,
                self.path,
                self.query,
                self.fragment,
            ]
        )[index]

    def __iter__(self):
        return iter(
            runtime.math_tuple(
                [
                    self.scheme,
                    self.netloc,
                    self.path,
                    self.query,
                    self.fragment,
                ]
            )
        )

    def geturl(self):
        return urlunsplit(self)

    def __repr__(self):
        return (
            "SplitResult(scheme="
            + repr(self.scheme)
            + ", netloc="
            + repr(self.netloc)
            + ", path="
            + repr(self.path)
            + ", query="
            + repr(self.query)
            + ", fragment="
            + repr(self.fragment)
            + ")"
        )


class ParseResult(SplitResult):
    def __init__(self, scheme, netloc, path, params, query, fragment):
        SplitResult.__init__(self, scheme, netloc, path, query, fragment)
        self.params = params

    def __len__(self):
        return 6

    def __getitem__(self, index):
        return runtime.math_tuple(
            [
                self.scheme,
                self.netloc,
                self.path,
                self.params,
                self.query,
                self.fragment,
            ]
        )[index]

    def __iter__(self):
        return iter(
            runtime.math_tuple(
                [
                    self.scheme,
                    self.netloc,
                    self.path,
                    self.params,
                    self.query,
                    self.fragment,
                ]
            )
        )

    def geturl(self):
        return urlunparse(self)


def _scheme(url):
    colon = url.find(":")
    if colon <= 0:
        return "", url
    candidate = url[:colon]
    if candidate[0] not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz":
        return "", url
    valid = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-."
    if not all(character in valid for character in candidate):
        return "", url
    return candidate.lower(), url[colon + 1 :]


def urlsplit(url, scheme="", allow_fragments=True):
    cleaned = ""
    for character in str(url).strip():
        if character not in "\t\r\n":
            cleaned += character
    url = cleaned
    parsed_scheme, rest = _scheme(url)
    if parsed_scheme:
        scheme = parsed_scheme
    else:
        rest = url
    netloc = ""
    if rest.startswith("//"):
        rest = rest[2:]
        end = len(rest)
        for separator in "/?#":
            position = rest.find(separator)
            if position >= 0:
                end = min(end, position)
        netloc = rest[:end]
        rest = rest[end:]
    fragment = ""
    if allow_fragments and "#" in rest:
        rest, fragment = rest.split("#", 1)
    query = ""
    if "?" in rest:
        rest, query = rest.split("?", 1)
    return SplitResult(scheme, netloc, rest, query, fragment)


def urlparse(url, scheme="", allow_fragments=True):
    split = urlsplit(url, scheme, allow_fragments)
    path = split.path
    params = ""
    if split.scheme in uses_params and ";" in path:
        path, params = path.rsplit(";", 1)
    return ParseResult(
        split.scheme,
        split.netloc,
        path,
        params,
        split.query,
        split.fragment,
    )


def urlunsplit(components):
    scheme, netloc, path, query, fragment = components
    answer = ""
    if scheme:
        answer += scheme + ":"
    if netloc or (scheme in uses_netloc and path.startswith("//")):
        answer += "//" + netloc
        if path and not path.startswith("/"):
            answer += "/"
    answer += path
    if query:
        answer += "?" + query
    if fragment:
        answer += "#" + fragment
    return answer


def urlunparse(components):
    scheme, netloc, path, params, query, fragment = components
    if params:
        path += ";" + params
    return urlunsplit((scheme, netloc, path, query, fragment))


def urldefrag(url):
    if "#" not in url:
        return runtime.named_tuple([url, ""], "DefragResult", ["url", "fragment"])
    base, fragment = url.split("#", 1)
    return runtime.named_tuple([base, fragment], "DefragResult", ["url", "fragment"])


def _normalize_path(path):
    absolute = path.startswith("/")
    trailing = path.endswith("/")
    parts = []
    for part in path.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
        else:
            parts.append(part)
    answer = "/".join(parts)
    if absolute:
        answer = "/" + answer
    if trailing and answer and not answer.endswith("/"):
        answer += "/"
    return answer or ("/" if absolute else "")


def urljoin(base, url, allow_fragments=True):
    if not base:
        return url
    if not url:
        return base
    target = urlparse(url, allow_fragments=allow_fragments)
    if target.scheme:
        return target.geturl()
    origin = urlparse(base, allow_fragments=allow_fragments)
    scheme = origin.scheme
    if target.netloc:
        return urlunparse(
            (
                scheme,
                target.netloc,
                target.path,
                target.params,
                target.query,
                target.fragment,
            )
        )
    netloc = origin.netloc
    if target.path.startswith("/"):
        path = target.path
    elif target.path:
        directory = origin.path.rsplit("/", 1)[0] if "/" in origin.path else ""
        path = _normalize_path(directory + "/" + target.path)
    else:
        path = origin.path
    params = target.params if target.path else origin.params
    query = target.query if target.path or target.query else origin.query
    return urlunparse((scheme, netloc, path, params, query, target.fragment))


_ALWAYS_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~"


def quote_from_bytes(value, safe="/"):
    data = bytes(value)
    safe_bytes = _ALWAYS_SAFE + safe
    answer = ""
    for byte in data:
        character = chr(byte)
        answer += (
            character
            if character in safe_bytes
            else "%" + hex(byte)[2:].upper().rjust(2, "0")
        )
    return answer


def quote(string, safe="/", encoding=None, errors=None):
    if isinstance(string, bytes):
        if encoding is not None or errors is not None:
            raise TypeError("quote() does not support encoding for bytes")
        return quote_from_bytes(string, safe)
    return quote_from_bytes(
        string.encode(
            "utf8" if encoding is None else encoding,
            "strict" if errors is None else errors,
        ),
        safe,
    )


def quote_plus(string, safe="", encoding=None, errors=None):
    answer = ""
    for character in quote(string, safe + " ", encoding, errors):
        answer += "+" if character == " " else character
    return answer


def unquote_to_bytes(string):
    if isinstance(string, bytes):
        string = string.decode("ascii")
    answer = bytearray()
    index = 0
    while index < len(string):
        if string[index] == "%" and index + 2 < len(string):
            try:
                answer.append(int(string[index + 1 : index + 3], 16))
                index += 3
                continue
            except ValueError:
                pass
        answer.extend(string[index].encode("utf8"))
        index += 1
    return bytes(answer)


def unquote(string, encoding="utf-8", errors="replace"):
    return unquote_to_bytes(string).decode(encoding, errors)


def unquote_plus(string, encoding="utf-8", errors="replace"):
    answer = ""
    for character in string:
        answer += " " if character == "+" else character
    return unquote(answer, encoding, errors)


def urlencode(
    query, doseq=False, safe="", encoding=None, errors=None, quote_via=quote_plus
):
    items = query.items() if hasattr(query, "items") else query
    parts = []
    for key, value in items:
        values = value if doseq and isinstance(value, (list, tuple)) else [value]
        for item in values:
            encoded_key = quote_via(str(key), safe, encoding, errors)
            encoded_value = quote_via(str(item), safe, encoding, errors)
            parts.append(encoded_key + "=" + encoded_value)
    return "&".join(parts)


def parse_qsl(
    qs,
    keep_blank_values=False,
    strict_parsing=False,
    encoding="utf-8",
    errors="replace",
    max_num_fields=None,
    separator="&",
):
    fields = qs.split(separator) if qs else []
    if max_num_fields is not None and len(fields) > max_num_fields:
        raise ValueError("Max number of fields exceeded")
    answer = []
    for field in fields:
        if "=" in field:
            name, value = field.split("=", 1)
        elif strict_parsing:
            raise ValueError("bad query field: " + repr(field))
        else:
            name, value = field, ""
        if value or keep_blank_values:
            answer.append(
                runtime.math_tuple(
                    [
                        unquote_plus(name, encoding, errors),
                        unquote_plus(value, encoding, errors),
                    ]
                )
            )
    return answer


def parse_qs(
    qs,
    keep_blank_values=False,
    strict_parsing=False,
    encoding="utf-8",
    errors="replace",
    max_num_fields=None,
    separator="&",
):
    answer = dict()
    for name, value in parse_qsl(
        qs,
        keep_blank_values,
        strict_parsing,
        encoding,
        errors,
        max_num_fields,
        separator,
    ):
        if name not in answer:
            answer.__setitem__(name, [])
        answer.__getitem__(name).append(value)
    return answer
