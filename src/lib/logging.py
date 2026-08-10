"""A compact, compatible implementation of Python's :mod:`logging` API.

The module deliberately implements the standard handler/formatter/logger
protocol rather than redirecting Python logging to ``console.log``.  That
keeps capture tools such as pytest's ``caplog`` fixture deterministic.
"""

import os
import time


CRITICAL = FATAL = 50
ERROR = 40
WARNING = WARN = 30
INFO = 20
DEBUG = 10
NOTSET = 0

_levelToName = {
    CRITICAL: "CRITICAL",
    ERROR: "ERROR",
    WARNING: "WARNING",
    INFO: "INFO",
    DEBUG: "DEBUG",
    NOTSET: "NOTSET",
}
_nameToLevel = {name: level for level, name in _levelToName.items()}
_nameToLevel["WARN"] = WARNING
_nameToLevel["FATAL"] = CRITICAL
raiseExceptions = True


def getLevelName(level):
    if isinstance(level, str):
        return _nameToLevel.get(level, "Level " + level)
    return _levelToName.get(level, "Level " + str(level))


def addLevelName(level, name):
    _levelToName[level] = name
    _nameToLevel[name] = level


def _checkLevel(level):
    if isinstance(level, int):
        return level
    if isinstance(level, str) and level in _nameToLevel:
        return _nameToLevel[level]
    raise ValueError("Unknown level: " + repr(level))


class LogRecord:
    def __init__(
        self,
        name,
        level,
        pathname,
        lineno,
        msg,
        args,
        exc_info=None,
        func=None,
        sinfo=None,
        **kwargs,
    ):
        self.name = name
        self.msg = msg
        self.args = args
        self.levelname = getLevelName(level)
        self.levelno = level
        self.pathname = pathname
        self.filename = os.path.basename(pathname) if pathname else ""
        self.module = os.path.splitext(self.filename)[0]
        self.exc_info = exc_info
        self.exc_text = None
        self.stack_info = sinfo
        self.lineno = lineno
        self.funcName = func
        self.created = time.time()
        self.msecs = (self.created - int(self.created)) * 1000
        self.relativeCreated = 0.0
        self.thread = None
        self.threadName = None
        self.processName = None
        self.process = None
        for key, value in kwargs.items():
            setattr(self, key, value)

    def getMessage(self):
        message = str(self.msg)
        if self.args:
            message = message % self.args
        return message


def makeLogRecord(values):
    record = LogRecord(None, NOTSET, "", 0, "", (), None, None)
    record.__dict__.update(values)
    return record


class Filter:
    def __init__(self, name=""):
        self.name = name

    def filter(self, record):
        if not self.name:
            return True
        return record.name == self.name or record.name.startswith(self.name + ".")


class Filterer:
    def __init__(self):
        self.filters = []

    def addFilter(self, filter_):
        if filter_ not in self.filters:
            self.filters.append(filter_)

    def removeFilter(self, filter_):
        if filter_ in self.filters:
            self.filters.remove(filter_)

    def filter(self, record):
        for filter_ in self.filters:
            result = (
                filter_.filter(record)
                if hasattr(filter_, "filter")
                else filter_(record)
            )
            if not result:
                return False
        return True


class PercentStyle:
    default_format = "%(message)s"
    asctime_format = "%(asctime)s"

    def __init__(self, fmt, defaults=None):
        self._fmt = fmt or self.default_format
        self._defaults = defaults

    def usesTime(self):
        return "%(asctime)" in self._fmt

    def validate(self):
        return None

    def format(self, record):
        values = {}
        if self._defaults:
            values.update(self._defaults)
        values.update(record.__dict__)
        return self._fmt % values


class Formatter:
    default_time_format = "%Y-%m-%d %H:%M:%S"
    default_msec_format = "%s,%03d"
    converter = staticmethod(time.localtime)

    def __init__(self, fmt=None, datefmt=None, style="%", validate=True, defaults=None):
        if style != "%":
            raise ValueError("Only '%' logging format style is supported")
        self._style = PercentStyle(fmt, defaults=defaults)
        self._fmt = self._style._fmt
        self.datefmt = datefmt

    def formatTime(self, record, datefmt=None):
        moment = self.converter(record.created)
        if datefmt:
            return time.strftime(datefmt, moment)
        text = time.strftime(self.default_time_format, moment)
        return self.default_msec_format % (text, record.msecs)

    def formatException(self, exc_info):
        if exc_info is None:
            return ""
        if isinstance(exc_info, tuple) and len(exc_info) > 1:
            return repr(exc_info[1])
        return repr(exc_info)

    def formatStack(self, stack_info):
        return stack_info

    def format(self, record):
        record.message = record.getMessage()
        if self._style.usesTime():
            record.asctime = self.formatTime(record, self.datefmt)
        text = self._style.format(record)
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            if record.exc_text:
                text += "\n" + record.exc_text
        if record.stack_info:
            text += "\n" + self.formatStack(record.stack_info)
        return text


_defaultFormatter = Formatter()


class Handler(Filterer):
    def __init__(self, level=NOTSET):
        super().__init__()
        self.level = _checkLevel(level)
        self.formatter = None
        self.name = None

    def setLevel(self, level):
        self.level = _checkLevel(level)

    def setFormatter(self, formatter):
        self.formatter = formatter

    def format(self, record):
        return (self.formatter or _defaultFormatter).format(record)

    def handle(self, record):
        if self.filter(record):
            self.emit(record)
            return True
        return False

    def emit(self, record):
        raise NotImplementedError

    def flush(self):
        stream = getattr(self, "stream", None)
        if stream is not None and hasattr(stream, "flush"):
            stream.flush()

    def close(self):
        return None

    def handleError(self, record):
        if raiseExceptions:
            raise

    def set_name(self, name):
        self.name = name

    def get_name(self):
        return self.name


class StreamHandler(Handler):
    terminator = "\n"

    def __init__(self, stream=None):
        super().__init__()
        if stream is None:
            import sys

            stream = sys.stderr
        self.stream = stream

    def emit(self, record):
        try:
            self.stream.write(self.format(record) + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)

    def setStream(self, stream):
        old = self.stream
        self.flush()
        self.stream = stream
        return old


class FileHandler(StreamHandler):
    def __init__(self, filename, mode="a", encoding=None, delay=False, errors=None):
        self.baseFilename = os.path.abspath(filename)
        self.mode = mode
        self.encoding = encoding
        self.errors = errors
        self.delay = delay
        stream = (
            None
            if delay
            else open(self.baseFilename, mode, encoding=encoding, errors=errors)
        )
        super().__init__(stream)

    def emit(self, record):
        if self.stream is None:
            self.stream = open(
                self.baseFilename, self.mode, encoding=self.encoding, errors=self.errors
            )
        super().emit(record)

    def close(self):
        if self.stream is not None:
            self.stream.close()
            self.stream = None


class NullHandler(Handler):
    def handle(self, record):
        return None

    def emit(self, record):
        return None


class _Manager:
    def __init__(self):
        self.disable = NOTSET
        self.loggerDict = {}


class Logger(Filterer):
    def __init__(self, name, level=NOTSET):
        super().__init__()
        self.name = name
        self.level = _checkLevel(level)
        self.parent = None
        self.propagate = True
        self.handlers = []
        self.disabled = False
        self.manager = None

    def setLevel(self, level):
        self.level = _checkLevel(level)

    def getEffectiveLevel(self):
        logger = self
        while logger is not None:
            if logger.level:
                return logger.level
            logger = logger.parent
        return NOTSET

    def isEnabledFor(self, level):
        return (
            not self.disabled
            and level > self.manager.disable
            and level >= self.getEffectiveLevel()
        )

    def addHandler(self, handler):
        if handler not in self.handlers:
            self.handlers.append(handler)

    def removeHandler(self, handler):
        if handler in self.handlers:
            self.handlers.remove(handler)

    def hasHandlers(self):
        logger = self
        while logger is not None:
            if logger.handlers:
                return True
            if not logger.propagate:
                break
            logger = logger.parent
        return False

    def makeRecord(
        self,
        name,
        level,
        fn,
        line,
        msg,
        args,
        exc_info,
        func=None,
        extra=None,
        sinfo=None,
    ):
        record = LogRecord(name, level, fn, line, msg, args, exc_info, func, sinfo)
        if extra:
            for key, value in extra.items():
                setattr(record, key, value)
        return record

    def handle(self, record):
        if not self.disabled and self.filter(record):
            self.callHandlers(record)

    def callHandlers(self, record):
        logger = self
        while logger is not None:
            for handler in logger.handlers:
                if record.levelno >= handler.level:
                    handler.handle(record)
            if not logger.propagate:
                break
            logger = logger.parent

    def _log(
        self,
        level,
        msg,
        args,
        exc_info=None,
        extra=None,
        stack_info=False,
        stacklevel=1,
    ):
        record = self.makeRecord(
            self.name,
            level,
            "",
            0,
            msg,
            args,
            exc_info,
            None,
            extra,
            None if not stack_info else "",
        )
        self.handle(record)

    def log(self, level, msg, *args, **kwargs):
        level = _checkLevel(level)
        if self.isEnabledFor(level):
            self._log(level, msg, args, **kwargs)

    def debug(self, msg, *args, **kwargs):
        self.log(DEBUG, msg, *args, **kwargs)

    def info(self, msg, *args, **kwargs):
        self.log(INFO, msg, *args, **kwargs)

    def warning(self, msg, *args, **kwargs):
        self.log(WARNING, msg, *args, **kwargs)

    warn = warning

    def error(self, msg, *args, **kwargs):
        self.log(ERROR, msg, *args, **kwargs)

    def exception(self, msg, *args, **kwargs):
        kwargs["exc_info"] = True
        self.error(msg, *args, **kwargs)

    def critical(self, msg, *args, **kwargs):
        self.log(CRITICAL, msg, *args, **kwargs)


manager = _Manager()
root = Logger("root", WARNING)
root.manager = manager


def getLogger(name=None):
    if name is None or name == "" or name == "root":
        return root
    if name not in manager.loggerDict:
        logger = Logger(name)
        logger.manager = manager
        logger.parent = root
        manager.loggerDict[name] = logger
    return manager.loggerDict[name]


def disable(level=CRITICAL):
    manager.disable = _checkLevel(level)


def shutdown():
    for logger in [root] + list(manager.loggerDict.values()):
        for handler in list(logger.handlers):
            handler.flush()
            handler.close()


def basicConfig(**kwargs):
    if root.handlers and not kwargs.get("force", False):
        return
    if kwargs.get("force", False):
        root.handlers.clear()
    handler = StreamHandler(kwargs.get("stream"))
    handler.setFormatter(Formatter(kwargs.get("format"), kwargs.get("datefmt")))
    root.addHandler(handler)
    if kwargs.get("level") is not None:
        root.setLevel(kwargs["level"])


def log(level, msg, *args, **kwargs):
    root.log(level, msg, *args, **kwargs)


def debug(msg, *args, **kwargs):
    root.debug(msg, *args, **kwargs)


def info(msg, *args, **kwargs):
    root.info(msg, *args, **kwargs)


def warning(msg, *args, **kwargs):
    root.warning(msg, *args, **kwargs)


warn = warning


def error(msg, *args, **kwargs):
    root.error(msg, *args, **kwargs)


def exception(msg, *args, **kwargs):
    root.exception(msg, *args, **kwargs)


def critical(msg, *args, **kwargs):
    root.critical(msg, *args, **kwargs)


def captureWarnings(capture):
    return None


Logger.manager = manager
