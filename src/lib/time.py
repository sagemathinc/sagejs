"""Portable subset of Python's :mod:`time` module.

Clock and sleep primitives use the explicit Sage.js runtime boundary.  Calendar
conversion is delegated to the host's ECMAScript ``Date`` implementation.
"""

import sagejs.runtime as runtime


CLOCKS_PER_SEC = 1000000
_date_class = runtime.reflect.get(runtime.global_object, "Date")
_weekdays = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_months = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def _call(target, name, call_args=None):
    if call_args is None:
        call_args = []
    return runtime.reflect.apply(runtime.reflect.get(target, name), target, call_args)


def _date(milliseconds=None, local=True):
    if milliseconds is None:
        return runtime.reflect.construct(_date_class, [])
    return runtime.reflect.construct(_date_class, [milliseconds])


def time():
    """Return seconds since the Unix epoch as a floating-point number."""
    return float(runtime.wall_time())


def time_ns():
    return int(time() * 1000000000)


def monotonic():
    return float(runtime.wall_time())


def monotonic_ns():
    return int(monotonic() * 1000000000)


perf_counter = monotonic
perf_counter_ns = monotonic_ns
process_time = monotonic
thread_time = monotonic


def sleep(seconds):
    """Suspend execution for *seconds* in Node or an isolated worker."""
    if seconds < 0:
        raise ValueError("sleep length must be non-negative")
    runtime.blocking_sleep(seconds)


def _is_leap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _year_day(year, month, day):
    lengths = [31, 29 if _is_leap(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return sum(lengths[: month - 1]) + day


def _tuple(value, local):
    prefix = "" if local else "UTC"
    year = int(_call(value, "get" + prefix + "FullYear"))
    month = int(_call(value, "get" + prefix + "Month")) + 1
    day = int(_call(value, "get" + prefix + "Date"))
    hour = int(_call(value, "get" + prefix + "Hours"))
    minute = int(_call(value, "get" + prefix + "Minutes"))
    second = int(_call(value, "get" + prefix + "Seconds"))
    js_weekday = int(_call(value, "get" + prefix + "Day"))
    weekday = 6 if js_weekday == 0 else js_weekday - 1
    return (
        year,
        month,
        day,
        hour,
        minute,
        second,
        weekday,
        _year_day(year, month, day),
        -1 if local else 0,
    )


def gmtime(seconds=None):
    """Convert epoch seconds to a UTC nine-item time tuple."""
    if seconds is None:
        seconds = time()
    return _tuple(_date(seconds * 1000), False)


def localtime(seconds=None):
    """Convert epoch seconds to a local nine-item time tuple."""
    if seconds is None:
        seconds = time()
    return _tuple(_date(seconds * 1000), True)


def mktime(value):
    date = runtime.reflect.construct(
        _date_class,
        [
            value[0],
            value[1] - 1,
            value[2],
            value[3],
            value[4],
            value[5],
            0,
        ],
    )
    return float(_call(date, "getTime")) / 1000


def strftime(format, value=None):
    """Format the common portable directives used by Sage.js."""
    if value is None:
        value = localtime()
    replacements = {
        "%Y": str(value[0]).zfill(4),
        "%y": str(value[0] % 100).zfill(2),
        "%m": str(value[1]).zfill(2),
        "%d": str(value[2]).zfill(2),
        "%H": str(value[3]).zfill(2),
        "%M": str(value[4]).zfill(2),
        "%S": str(value[5]).zfill(2),
        "%a": _weekdays[value[6]],
        "%A": _weekdays[value[6]],
        "%b": _months[value[1] - 1],
        "%B": _months[value[1] - 1],
        "%j": str(value[7]).zfill(3),
        "%p": "AM" if value[3] < 12 else "PM",
        "%I": str((value[3] % 12) or 12).zfill(2),
        "%%": "%",
    }
    answer = str(format)
    for directive, replacement in replacements.items():
        answer = answer.replace(directive, replacement)
    return answer


def asctime(value=None):
    if value is None:
        value = localtime()
    return strftime("%a %b %d %H:%M:%S %Y", value)


def ctime(seconds=None):
    return asctime(localtime(seconds))


timezone = 0
altzone = 0
daylight = 0
tzname = ("UTC", "UTC")


def tzset():
    return None
