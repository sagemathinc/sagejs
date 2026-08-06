"""Value-oriented subset of Python's :mod:`datetime`.

This implements the constructors and stable representations needed by data
formats.  Calendar arithmetic can grow behind the same public value objects.
"""


MINYEAR = 1
MAXYEAR = 9999


def _check(name, value, minimum, maximum):
    value = int(value)
    if value < minimum or value > maximum:
        raise ValueError(name + ' out of range')
    return value


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
            + (int(days) + int(weeks) * 7) * 86400 * 1000000
        )
        self.days = total // (86400 * 1000000)
        remainder = total % (86400 * 1000000)
        self.seconds = remainder // 1000000
        self.microseconds = remainder % 1000000

    def __repr__(self):
        return (
            'datetime.timedelta(days=' + repr(self.days)
            + ', seconds=' + repr(self.seconds)
            + ', microseconds=' + repr(self.microseconds) + ')'
        )


class tzinfo:
    pass


class timezone(tzinfo):
    def __init__(self, offset, name=None):
        if not isinstance(offset, timedelta):
            raise TypeError('offset must be a timedelta')
        self._offset = offset
        self._name = name

    def utcoffset(self, dt):
        del dt
        return self._offset


timezone.utc = timezone(timedelta(0), 'UTC')


class date:
    def __init__(self, year, month, day):
        self.year = _check('year', year, MINYEAR, MAXYEAR)
        self.month = _check('month', month, 1, 12)
        self.day = _check('day', day, 1, 31)

    def isoformat(self):
        return (
            str(self.year).zfill(4) + '-' + str(self.month).zfill(2)
            + '-' + str(self.day).zfill(2))

    def __str__(self):
        return self.isoformat()

    def __repr__(self):
        return (
            'datetime.date(' + str(self.year) + ', ' + str(self.month)
            + ', ' + str(self.day) + ')')


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

    def isoformat(self):
        answer = (
            str(self.hour).zfill(2) + ':' + str(self.minute).zfill(2)
            + ':' + str(self.second).zfill(2))
        if self.microsecond:
            answer += '.' + str(self.microsecond).zfill(6)
        return answer

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

    def isoformat(self, sep='T', timespec='auto'):
        del timespec
        clock = time(
            self.hour, self.minute, self.second, self.microsecond,
            self.tzinfo, fold=self.fold)
        return date.isoformat(self) + sep + clock.isoformat()

    __str__ = isoformat
