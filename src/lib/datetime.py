"""Value-oriented implementation of Python's :mod:`datetime` core.

The implementation uses integer microseconds and Gregorian ordinals, keeping
calendar arithmetic exact and independent of the host time zone.  It covers
the value protocol used by pure-Python date, recurrence, and timezone
libraries; host-clock constructors can grow behind the same objects.
"""

MINYEAR = 1
MAXYEAR = 9999

_DAY_MICROSECONDS = 86400 * 1000000
_MONTH_LENGTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def _check(name, value, minimum, maximum):
    value = int(value)
    if value < minimum or value > maximum:
        raise ValueError(name + ' out of range')
    return value


def _isleap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _days_before_year(year):
    previous = year - 1
    return previous * 365 + previous // 4 - previous // 100 + previous // 400


def _days_in_month(year, month):
    answer = _MONTH_LENGTHS[month]
    if month == 2 and _isleap(year):
        answer += 1
    return answer


def _ymd_to_ordinal(year, month, day):
    return (
        _days_before_year(year)
        + _DAYS_BEFORE_MONTH[month]
        + (1 if month > 2 and _isleap(year) else 0)
        + day
    )


def _ordinal_to_ymd(ordinal):
    if ordinal < 1 or ordinal > _ymd_to_ordinal(MAXYEAR, 12, 31):
        raise ValueError('ordinal must be >= 1')
    # The calendar repeats every 400 years (146097 days).  Decompose into a
    # nearby year, then finish with at most one short linear walk.
    zero_based = ordinal - 1
    cycles, day_in_cycle = divmod(zero_based, 146097)
    year = cycles * 400 + 1
    while True:
        year_days = 366 if _isleap(year) else 365
        if day_in_cycle < year_days:
            break
        day_in_cycle -= year_days
        year += 1
    month = 1
    while True:
        month_days = _days_in_month(year, month)
        if day_in_cycle < month_days:
            break
        day_in_cycle -= month_days
        month += 1
    return year, month, day_in_cycle + 1


def _format_offset(offset):
    if offset is None:
        return ''
    total = offset._total_microseconds
    sign = '+' if total >= 0 else '-'
    total = abs(total)
    total_seconds = total // 1000000
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    answer = sign + str(hours).zfill(2) + ':' + str(minutes).zfill(2)
    if seconds:
        answer += ':' + str(seconds).zfill(2)
    return answer


class timedelta:
    def __init__(
        self,
        days=0,
        seconds=0,
        microseconds=0,
        milliseconds=0,
        minutes=0,
        hours=0,
        weeks=0,
    ):
        total = (
            int(microseconds)
            + int(milliseconds) * 1000
            + int(seconds) * 1000000
            + int(minutes) * 60 * 1000000
            + int(hours) * 3600 * 1000000
            + (int(days) + int(weeks) * 7) * _DAY_MICROSECONDS
        )
        self._total_microseconds = total
        self.days, remainder = divmod(total, _DAY_MICROSECONDS)
        self.seconds, self.microseconds = divmod(remainder, 1000000)

    def total_seconds(self):
        return self._total_microseconds / 1000000

    def __add__(self, other):
        if isinstance(other, timedelta):
            return timedelta(microseconds=(
                self._total_microseconds + other._total_microseconds
            ))
        return NotImplemented

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return timedelta(microseconds=(
                self._total_microseconds - other._total_microseconds
            ))
        return NotImplemented

    def __neg__(self):
        return timedelta(microseconds=-self._total_microseconds)

    def __abs__(self):
        return self if self._total_microseconds >= 0 else -self

    def __mul__(self, factor):
        if isinstance(factor, int):
            return timedelta(microseconds=self._total_microseconds * factor)
        return NotImplemented

    __rmul__ = __mul__

    def __bool__(self):
        return self._total_microseconds != 0

    def __eq__(self, other):
        return (
            isinstance(other, timedelta)
            and self._total_microseconds == other._total_microseconds
        )

    def __lt__(self, other):
        if not isinstance(other, timedelta):
            return NotImplemented
        return self._total_microseconds < other._total_microseconds

    def __le__(self, other):
        return self == other or self < other

    def __gt__(self, other):
        return not self <= other

    def __ge__(self, other):
        return not self < other

    def __hash__(self):
        return hash((self.days, self.seconds, self.microseconds))

    def __str__(self):
        days = ''
        if self.days:
            suffix = ' day, ' if abs(self.days) == 1 else ' days, '
            days = str(self.days) + suffix
        hours, remainder = divmod(self.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        clock = str(hours) + ':' + str(minutes).zfill(2) + ':' + str(seconds).zfill(2)
        if self.microseconds:
            clock += '.' + str(self.microseconds).zfill(6)
        return days + clock

    def __repr__(self):
        return (
            'datetime.timedelta(days=' + repr(self.days)
            + ', seconds=' + repr(self.seconds)
            + ', microseconds=' + repr(self.microseconds) + ')'
        )


timedelta.min = timedelta(days=-999999999)
timedelta.max = timedelta(days=999999999, hours=23, minutes=59, seconds=59,
                          microseconds=999999)
timedelta.resolution = timedelta(microseconds=1)


class tzinfo:
    def utcoffset(self, dt):
        raise NotImplementedError

    def dst(self, dt):
        raise NotImplementedError

    def tzname(self, dt):
        raise NotImplementedError

    def fromutc(self, dt):
        if dt.tzinfo is not self:
            raise ValueError('fromutc: dt.tzinfo is not self')
        offset = self.utcoffset(dt)
        if offset is None:
            raise ValueError('fromutc: utcoffset() returned None')
        return dt + offset


class timezone(tzinfo):
    def __init__(self, offset, name=None):
        if not isinstance(offset, timedelta):
            raise TypeError('offset must be a timedelta')
        if abs(offset) >= timedelta(days=1):
            raise ValueError('offset must be strictly between -24h and +24h')
        self._offset = offset
        self._name = name

    def utcoffset(self, dt):
        del dt
        return self._offset

    def dst(self, dt):
        del dt
        return None

    def tzname(self, dt):
        del dt
        if self._name is not None:
            return self._name
        return 'UTC' + _format_offset(self._offset)

    def __repr__(self):
        if self is timezone.utc:
            return 'datetime.timezone.utc'
        return 'datetime.timezone(' + repr(self._offset) + ')'


timezone.utc = timezone(timedelta(0), 'UTC')


class date:
    def __init__(self, year, month, day):
        self.year = _check('year', year, MINYEAR, MAXYEAR)
        self.month = _check('month', month, 1, 12)
        maximum_day = _days_in_month(self.year, self.month)
        self.day = _check('day', day, 1, maximum_day)

    @classmethod
    def fromordinal(cls, ordinal):
        return cls(*_ordinal_to_ymd(int(ordinal)))

    def toordinal(self):
        return _ymd_to_ordinal(self.year, self.month, self.day)

    def weekday(self):
        return (self.toordinal() + 6) % 7

    def isoweekday(self):
        return self.weekday() + 1

    def replace(self, year=None, month=None, day=None):
        return type(self)(
            self.year if year is None else year,
            self.month if month is None else month,
            self.day if day is None else day,
        )

    def isoformat(self):
        return (
            str(self.year).zfill(4) + '-' + str(self.month).zfill(2)
            + '-' + str(self.day).zfill(2))

    def __add__(self, other):
        if isinstance(other, timedelta):
            return type(self).fromordinal(self.toordinal() + other.days)
        return NotImplemented

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return self + (-other)
        if isinstance(other, date):
            return timedelta(days=self.toordinal() - other.toordinal())
        return NotImplemented

    def _comparison_key(self):
        return self.year, self.month, self.day

    def __eq__(self, other):
        return isinstance(other, date) and self._comparison_key() == other._comparison_key()

    def __lt__(self, other):
        if not isinstance(other, date):
            return NotImplemented
        return self._comparison_key() < other._comparison_key()

    def __le__(self, other):
        return self == other or self < other

    def __gt__(self, other):
        return not self <= other

    def __ge__(self, other):
        return not self < other

    def __hash__(self):
        return hash(self._comparison_key())

    def __str__(self):
        return self.isoformat()

    def __repr__(self):
        return (
            'datetime.date(' + str(self.year) + ', ' + str(self.month)
            + ', ' + str(self.day) + ')')


date.min = date(MINYEAR, 1, 1)
date.max = date(MAXYEAR, 12, 31)
date.resolution = timedelta(days=1)


class time:
    def __init__(
        self, hour=0, minute=0, second=0, microsecond=0,
        tzinfo=None, *, fold=0,
    ):
        self.hour = _check('hour', hour, 0, 23)
        self.minute = _check('minute', minute, 0, 59)
        self.second = _check('second', second, 0, 59)
        self.microsecond = _check('microsecond', microsecond, 0, 999999)
        self.tzinfo = tzinfo
        self.fold = _check('fold', fold, 0, 1)

    def utcoffset(self):
        return None if self.tzinfo is None else self.tzinfo.utcoffset(None)

    def tzname(self):
        return None if self.tzinfo is None else self.tzinfo.tzname(None)

    def isoformat(self, timespec='auto'):
        del timespec
        answer = (
            str(self.hour).zfill(2) + ':' + str(self.minute).zfill(2)
            + ':' + str(self.second).zfill(2))
        if self.microsecond:
            answer += '.' + str(self.microsecond).zfill(6)
        return answer + _format_offset(self.utcoffset())

    __str__ = isoformat


class datetime(date):
    def __init__(
        self, year, month, day, hour=0, minute=0, second=0,
        microsecond=0, tzinfo=None, *, fold=0,
    ):
        date.__init__(self, year, month, day)
        self.hour = _check('hour', hour, 0, 23)
        self.minute = _check('minute', minute, 0, 59)
        self.second = _check('second', second, 0, 59)
        self.microsecond = _check('microsecond', microsecond, 0, 999999)
        self.tzinfo = tzinfo
        self.fold = _check('fold', fold, 0, 1)

    @classmethod
    def fromordinal(cls, ordinal):
        year, month, day = _ordinal_to_ymd(int(ordinal))
        return cls(year, month, day)

    @classmethod
    def combine(cls, date_value, time_value, tzinfo=None):
        if tzinfo is None:
            tzinfo = time_value.tzinfo
        return cls(
            date_value.year, date_value.month, date_value.day,
            time_value.hour, time_value.minute, time_value.second,
            time_value.microsecond, tzinfo, fold=time_value.fold,
        )

    def _wall_microseconds(self):
        return (
            (self.toordinal() - 1) * _DAY_MICROSECONDS
            + self.hour * 3600 * 1000000
            + self.minute * 60 * 1000000
            + self.second * 1000000
            + self.microsecond
        )

    @classmethod
    def _from_wall_microseconds(cls, total, tzinfo=None, fold=0):
        ordinal, day_microseconds = divmod(total, _DAY_MICROSECONDS)
        year, month, day = _ordinal_to_ymd(ordinal + 1)
        hour, remainder = divmod(day_microseconds, 3600 * 1000000)
        minute, remainder = divmod(remainder, 60 * 1000000)
        second, microsecond = divmod(remainder, 1000000)
        return cls(
            year, month, day, hour, minute, second, microsecond,
            tzinfo, fold=fold,
        )

    def replace(
        self, year=None, month=None, day=None, hour=None, minute=None,
        second=None, microsecond=None, tzinfo=Ellipsis, *, fold=None,
    ):
        return type(self)(
            self.year if year is None else year,
            self.month if month is None else month,
            self.day if day is None else day,
            self.hour if hour is None else hour,
            self.minute if minute is None else minute,
            self.second if second is None else second,
            self.microsecond if microsecond is None else microsecond,
            self.tzinfo if tzinfo is Ellipsis else tzinfo,
            fold=self.fold if fold is None else fold,
        )

    def utcoffset(self):
        return None if self.tzinfo is None else self.tzinfo.utcoffset(self)

    def dst(self):
        return None if self.tzinfo is None else self.tzinfo.dst(self)

    def tzname(self):
        return None if self.tzinfo is None else self.tzinfo.tzname(self)

    def astimezone(self, tz=None):
        if tz is None:
            raise NotImplementedError('local host timezone is not available')
        if self.tzinfo is None:
            raise ValueError('astimezone() cannot be applied to a naive datetime')
        offset = self.utcoffset()
        if offset is None:
            raise ValueError('utcoffset() returned None')
        utc = (self.replace(tzinfo=None) - offset).replace(tzinfo=tz)
        return tz.fromutc(utc)

    def __add__(self, other):
        if isinstance(other, timedelta):
            return self._from_wall_microseconds(
                self._wall_microseconds() + other._total_microseconds,
                self.tzinfo,
                self.fold,
            )
        return NotImplemented

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return self + (-other)
        if isinstance(other, datetime):
            left = self._wall_microseconds()
            right = other._wall_microseconds()
            left_offset = self.utcoffset()
            right_offset = other.utcoffset()
            if left_offset is not None:
                left -= left_offset._total_microseconds
            if right_offset is not None:
                right -= right_offset._total_microseconds
            return timedelta(microseconds=left - right)
        return NotImplemented

    def _comparison_key(self):
        total = self._wall_microseconds()
        offset = self.utcoffset()
        if offset is not None:
            total -= offset._total_microseconds
        return total

    def isoformat(self, sep='T', timespec='auto'):
        clock = time(
            self.hour, self.minute, self.second, self.microsecond,
            self.tzinfo, fold=self.fold)
        return date.isoformat(self) + sep + clock.isoformat(timespec)

    def strftime(self, format_string):
        replacements = {
            '%Y': str(self.year).zfill(4),
            '%m': str(self.month).zfill(2),
            '%d': str(self.day).zfill(2),
            '%H': str(self.hour).zfill(2),
            '%M': str(self.minute).zfill(2),
            '%S': str(self.second).zfill(2),
            '%f': str(self.microsecond).zfill(6),
            '%a': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][self.weekday()],
            '%A': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][self.weekday()],
            '%b': ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][self.month],
            '%B': ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][self.month],
            '%Z': self.tzname() or '',
            '%z': _format_offset(self.utcoffset()).replace(':', ''),
            '%%': '%',
        }
        answer = str(format_string)
        for directive, value in replacements.items():
            answer = answer.replace(directive, value)
        return answer

    __str__ = isoformat

    def __repr__(self):
        values = [
            str(self.year), str(self.month), str(self.day), str(self.hour),
            str(self.minute), str(self.second), str(self.microsecond),
        ]
        answer = 'datetime.datetime(' + ', '.join(values)
        if self.tzinfo is not None:
            answer += ', tzinfo=' + repr(self.tzinfo)
        return answer + ')'


datetime.min = datetime(MINYEAR, 1, 1)
datetime.max = datetime(MAXYEAR, 12, 31, 23, 59, 59, 999999)
datetime.resolution = timedelta(microseconds=1)
