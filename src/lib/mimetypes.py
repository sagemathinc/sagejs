"""Portable MIME type inference compatible with Python's `mimetypes` API."""

from __future__ import annotations

import os


suffix_map = {
    ".svgz": ".svg.gz",
    ".tgz": ".tar.gz",
    ".taz": ".tar.gz",
    ".tz": ".tar.gz",
    ".tbz2": ".tar.bz2",
    ".txz": ".tar.xz",
}

encodings_map = {
    ".br": "br",
    ".bz2": "bzip2",
    ".gz": "gzip",
    ".xz": "xz",
    ".Z": "compress",
}

types_map = {
    ".aac": "audio/aac",
    ".avi": "video/x-msvideo",
    ".bin": "application/octet-stream",
    ".bmp": "image/bmp",
    ".css": "text/css",
    ".csv": "text/csv",
    ".gif": "image/gif",
    ".htm": "text/html",
    ".html": "text/html",
    ".ico": "image/vnd.microsoft.icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".json": "application/json",
    ".m4a": "audio/mp4",
    ".m4v": "video/mp4",
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".ogv": "video/ogg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tar": "application/x-tar",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".txt": "text/plain",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".xml": "application/xml",
    ".zip": "application/zip",
}

common_types = {
    ".jpg": "image/jpg",
    ".rtf": "application/rtf",
    ".xul": "text/xul",
}

knownfiles = []


def init(files=None):
    """Initialize the portable built-in database.

    Sage.js intentionally does not read host-specific MIME registry files.
    Explicit extra files are currently unsupported because their platform
    syntax is not part of the portable runtime.
    """
    if files:
        raise NotImplementedError("loading host MIME registry files is unsupported")


def add_type(mime_type, extension, strict=True):
    """Register `extension` for `mime_type` in this process."""
    extension = str(extension).lower()
    if not extension.startswith("."):
        extension = "." + extension
    (types_map if strict else common_types)[extension] = str(mime_type)


def _path_text(value):
    try:
        value = os.fspath(value)
    except TypeError:
        pass
    if isinstance(value, bytes):
        value = value.decode()
    return str(value)


def guess_type(url, strict=True):
    """Guess `(MIME type, content encoding)` from a URL or path suffix."""
    path = _path_text(url).split("#", 1)[0].split("?", 1)[0]
    root, extension = os.path.splitext(path)
    mapped = suffix_map.get(extension)
    if mapped is not None:
        path = root + mapped
        root, extension = os.path.splitext(path)
    encoding = encodings_map.get(extension)
    if encoding is not None:
        _, extension = os.path.splitext(root)
    mime_type = types_map.get(extension)
    if mime_type is None:
        mime_type = types_map.get(extension.lower())
    if mime_type is None and not strict:
        mime_type = common_types.get(extension.lower())
    return mime_type, encoding


def guess_file_type(path, *, strict=True):
    """Guess the type of a filesystem path."""
    return guess_type(path, strict=strict)


def guess_all_extensions(mime_type, strict=True):
    """Return every registered suffix for `mime_type`."""
    answer = [suffix for suffix, value in types_map.items() if value == mime_type]
    if not strict:
        answer.extend(
            suffix for suffix, value in common_types.items() if value == mime_type
        )
    return answer


def guess_extension(mime_type, strict=True):
    """Return the first registered suffix for `mime_type`, if any."""
    extensions = guess_all_extensions(mime_type, strict=strict)
    return extensions[0] if extensions else None


class MimeTypes:
    """Small mutable MIME database compatible with `mimetypes.MimeTypes`."""

    def __init__(self, filenames=(), strict=True):
        if filenames:
            init(filenames)
        self.strict = strict

    def add_type(self, mime_type, extension, strict=True):
        add_type(mime_type, extension, strict=strict)

    def guess_type(self, url, strict=True):
        return guess_type(url, strict=strict)

    def guess_file_type(self, path, *, strict=True):
        return guess_file_type(path, strict=strict)

    def guess_all_extensions(self, mime_type, strict=True):
        return guess_all_extensions(mime_type, strict=strict)

    def guess_extension(self, mime_type, strict=True):
        return guess_extension(mime_type, strict=strict)
