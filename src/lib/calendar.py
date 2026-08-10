"""Calendar utilities for the proleptic Gregorian calendar.

This compact implementation follows the public contracts of Python's
``calendar`` module that pure-Python date libraries commonly depend on.  Day
numbers use Monday as zero, matching :meth:`datetime.date.weekday`.
"""

MONDAY = 0
TUESDAY = 1
WEDNESDAY = 2
THURSDAY = 3
FRIDAY = 4
SATURDAY = 5
SUNDAY = 6

day_name = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
day_abbr = [name[:3] for name in day_name]
month_name = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
month_abbr = [name[:3] for name in month_name]

_month_lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_firstweekday = MONDAY


class IllegalMonthError(ValueError):
    def __init__(self, month):
        self.month = month
        super().__init__("bad month number " + repr(month) + "; must be 1-12")


class IllegalWeekdayError(ValueError):
    def __init__(self, weekday_value):
        self.weekday = weekday_value
        super().__init__("bad weekday number " + repr(weekday_value) + "; must be 0-6")


def isleap(year):
    """Return whether *year* is a leap year in the Gregorian calendar."""
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def leapdays(year1, year2):
    """Return the number of leap years in ``range(year1, year2)``."""
    year1 -= 1
    year2 -= 1
    return (
        year2 // 4
        - year1 // 4
        - (year2 // 100 - year1 // 100)
        + (year2 // 400 - year1 // 400)
    )


def weekday(year, month, day):
    """Return the weekday of a Gregorian date, where Monday is zero."""
    if month < 1 or month > 12:
        raise IllegalMonthError(month)
    days = monthrange(year, month)[1]
    if day < 1 or day > days:
        raise ValueError("day is out of range for month")
    # Sakamoto's Gregorian algorithm returns Sunday as zero.  Python modulo
    # gives this formula the desired proleptic behavior for all integer years.
    offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
    adjusted_year = year - 1 if month < 3 else year
    sunday_zero = (
        adjusted_year
        + adjusted_year // 4
        - adjusted_year // 100
        + adjusted_year // 400
        + offsets[month - 1]
        + day
    ) % 7
    return (sunday_zero + 6) % 7


def monthrange(year, month):
    """Return ``(first_weekday, number_of_days)`` for a month."""
    if month < 1 or month > 12:
        raise IllegalMonthError(month)
    days = _month_lengths[month]
    if month == 2 and isleap(year):
        days += 1
    # Avoid recursive monthrange() validation through weekday().
    offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
    adjusted_year = year - 1 if month < 3 else year
    sunday_zero = (
        adjusted_year
        + adjusted_year // 4
        - adjusted_year // 100
        + adjusted_year // 400
        + offsets[month - 1]
        + 1
    ) % 7
    return ((sunday_zero + 6) % 7, days)


def firstweekday():
    return _firstweekday


def setfirstweekday(first_weekday):
    global _firstweekday
    if first_weekday < MONDAY or first_weekday > SUNDAY:
        raise IllegalWeekdayError(first_weekday)
    _firstweekday = first_weekday


def monthcalendar(year, month):
    """Return a matrix representing a month's weeks; outside days are zero."""
    first_day, day_count = monthrange(year, month)
    padding = (first_day - _firstweekday) % 7
    values = [0] * padding + list(range(1, day_count + 1))
    values += [0] * ((-len(values)) % 7)
    return [values[index : index + 7] for index in range(0, len(values), 7)]


def weekheader(width):
    """Return a header containing abbreviated weekday names."""
    if width < 1:
        return ""
    names = day_name if width >= 9 else day_abbr
    ordered = names[_firstweekday:] + names[:_firstweekday]
    return " ".join(name[:width].center(width) for name in ordered)
