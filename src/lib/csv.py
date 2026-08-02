"""CSV readers and writers compatible with Python's common dialect APIs."""

import sagejs.runtime as runtime


QUOTE_MINIMAL = 0
QUOTE_ALL = 1
QUOTE_NONNUMERIC = 2
QUOTE_NONE = 3
QUOTE_STRINGS = 4
QUOTE_NOTNULL = 5


class Error(Exception):
    pass


class Dialect:
    delimiter = ','
    doublequote = True
    escapechar = None
    lineterminator = '\r\n'
    quotechar = '"'
    quoting = QUOTE_MINIMAL
    skipinitialspace = False
    strict = False


class excel(Dialect):
    pass


class excel_tab(excel):
    delimiter = '\t'


class unix_dialect(Dialect):
    lineterminator = '\n'
    quoting = QUOTE_ALL


_dialects = {
    'excel': excel,
    'excel-tab': excel_tab,
    'unix': unix_dialect,
}


def _replace_all(text, old, replacement):
    answer = ''
    while old in text:
        position = text.find(old)
        answer += text[:position] + replacement
        text = text[position + len(old):]
    return answer + text


def _numeric(value):
    return (
        isinstance(value, (int, float))
        or runtime.is_exact_integer(value)
    )


def register_dialect(name, dialect='excel', **parameters):
    _dialects[name] = _make_dialect(dialect, parameters)


def unregister_dialect(name):
    if name not in _dialects:
        raise Error('unknown dialect')
    del _dialects[name]


def get_dialect(name):
    if name not in _dialects:
        raise Error('unknown dialect')
    return _make_dialect(_dialects[name], {})


def list_dialects():
    return list(_dialects)


def _make_dialect(dialect, parameters):
    if isinstance(dialect, str):
        if dialect not in _dialects:
            raise Error('unknown dialect')
        dialect = _dialects[dialect]
    if isinstance(dialect, type):
        answer = dialect()
    else:
        answer = Dialect()
        for name in (
            'delimiter', 'doublequote', 'escapechar', 'lineterminator',
            'quotechar', 'quoting', 'skipinitialspace', 'strict',
        ):
            if hasattr(dialect, name):
                setattr(answer, name, getattr(dialect, name))
    for name, value in parameters.items():
        if not hasattr(answer, name):
            raise TypeError("'" + name + "' is an invalid keyword argument")
        setattr(answer, name, value)
    if not isinstance(answer.delimiter, str) or len(answer.delimiter) != 1:
        raise TypeError('delimiter must be a 1-character string')
    if answer.quotechar is not None and (
        not isinstance(answer.quotechar, str) or len(answer.quotechar) != 1
    ):
        raise TypeError('quotechar must be a 1-character string')
    if answer.escapechar is not None and (
        not isinstance(answer.escapechar, str) or len(answer.escapechar) != 1
    ):
        raise TypeError('escapechar must be a 1-character string')
    if answer.quoting not in (
        QUOTE_MINIMAL, QUOTE_ALL, QUOTE_NONNUMERIC, QUOTE_NONE,
        QUOTE_STRINGS, QUOTE_NOTNULL,
    ):
        raise TypeError('bad quoting value')
    if answer.quotechar is None and answer.quoting != QUOTE_NONE:
        raise TypeError('quotechar must be set if quoting enabled')
    return answer


@runtime.sequence_class
class _Reader:
    def __init__(self, csvfile, dialect='excel', **parameters):
        self.dialect = _make_dialect(dialect, parameters)
        self._source = iter(csvfile)
        self.line_num = 0

    def __iter__(self):
        return self

    def _line(self):
        line = next(self._source)
        if not isinstance(line, str):
            raise Error('iterator should return strings, not bytes')
        self.line_num += 1
        return line

    def __next__(self):
        dialect = self.dialect
        line = self._line()
        fields = []
        field = ''
        quoted_field = False
        in_quotes = False
        position = 0
        after_quote = False
        while True:
            if position >= len(line):
                if in_quotes:
                    try:
                        line += self._line()
                    except StopIteration:
                        if dialect.strict:
                            raise Error('unexpected end of data')
                        fields.append(field)
                        return fields
                    continue
                fields.append(self._convert(field, quoted_field))
                return fields

            character = line[position]
            position += 1
            if in_quotes:
                if dialect.escapechar is not None and character == dialect.escapechar:
                    if position >= len(line):
                        try:
                            line += self._line()
                        except StopIteration:
                            raise Error('unexpected end of data')
                    field += line[position]
                    position += 1
                elif character == dialect.quotechar:
                    if (
                        dialect.doublequote
                        and position < len(line)
                        and line[position] == dialect.quotechar
                    ):
                        field += dialect.quotechar
                        position += 1
                    else:
                        in_quotes = False
                        after_quote = True
                else:
                    field += character
                continue

            if after_quote:
                if character == dialect.delimiter:
                    fields.append(field)
                    field = ''
                    quoted_field = False
                    after_quote = False
                    continue
                if character in '\r\n':
                    if character == '\r' and position < len(line) and line[position] == '\n':
                        position += 1
                    fields.append(field)
                    return fields
                if dialect.strict:
                    raise Error(
                        "'" + dialect.delimiter
                        + "' expected after '" + dialect.quotechar + "'")
                field += character
                after_quote = False
                continue

            if (
                character == dialect.quotechar
                and field == ''
                and not quoted_field
            ):
                quoted_field = True
                in_quotes = True
            elif dialect.escapechar is not None and character == dialect.escapechar:
                if position >= len(line):
                    try:
                        line += self._line()
                    except StopIteration:
                        raise Error('unexpected end of data')
                field += line[position]
                position += 1
            elif character == dialect.delimiter:
                fields.append(self._convert(field, quoted_field))
                field = ''
                quoted_field = False
                if dialect.skipinitialspace:
                    while position < len(line) and line[position] == ' ':
                        position += 1
            elif character in '\r\n':
                if character == '\r' and position < len(line) and line[position] == '\n':
                    position += 1
                fields.append(self._convert(field, quoted_field))
                return fields
            else:
                field += character

    def _convert(self, field, quoted):
        if self.dialect.quoting == QUOTE_NONNUMERIC and not quoted:
            return float(field)
        if self.dialect.quoting == QUOTE_STRINGS and not quoted and field != '':
            return float(field)
        if self.dialect.quoting == QUOTE_NOTNULL and not quoted and field == '':
            return None
        return field


def reader(csvfile, dialect='excel', **parameters):
    return _Reader(csvfile, dialect, **parameters)


class _Writer:
    def __init__(self, csvfile, dialect='excel', **parameters):
        self.dialect = _make_dialect(dialect, parameters)
        self._file = csvfile

    def _field(self, value):
        dialect = self.dialect
        is_string = isinstance(value, str)
        text = '' if value is None else str(value)
        quote = (
            dialect.quoting == QUOTE_ALL
            or (dialect.quoting == QUOTE_NONNUMERIC and not _numeric(value))
            or (dialect.quoting == QUOTE_STRINGS and is_string)
            or (dialect.quoting == QUOTE_NOTNULL and value is not None)
        )
        if dialect.quoting == QUOTE_MINIMAL:
            quote = (
                dialect.delimiter in text
                or '\r' in text or '\n' in text
                or (
                    dialect.quotechar is not None
                    and dialect.quotechar in text
                )
            )
        if dialect.quotechar is not None and dialect.quotechar in text:
            if dialect.doublequote:
                text = _replace_all(
                    text,
                    dialect.quotechar,
                    dialect.quotechar + dialect.quotechar,
                )
                quote = True
            elif dialect.escapechar is not None:
                text = _replace_all(
                    text,
                    dialect.quotechar,
                    dialect.escapechar + dialect.quotechar,
                )
            else:
                raise Error('need to escape, but no escapechar set')
        if not quote and dialect.escapechar is not None:
            for special in (dialect.delimiter, '\r', '\n', dialect.escapechar):
                if special is not None and special in text:
                    text = _replace_all(
                        text, special, dialect.escapechar + special)
        if quote:
            return dialect.quotechar + text + dialect.quotechar
        return text

    def writerow(self, row):
        text = self.dialect.delimiter.join(
            [self._field(value) for value in row]
        ) + self.dialect.lineterminator
        return self._file.write(text)

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def writer(csvfile, dialect='excel', **parameters):
    return _Writer(csvfile, dialect, **parameters)


class DictReader:
    def __init__(
        self,
        csvfile,
        fieldnames=None,
        restkey=None,
        restval=None,
        dialect='excel',
        **parameters,
    ):
        self._reader = reader(csvfile, dialect, **parameters)
        self.fieldnames = fieldnames
        self.restkey = restkey
        self.restval = restval

    @property
    def line_num(self):
        return self._reader.line_num

    def __iter__(self):
        return self

    def __next__(self):
        if self.fieldnames is None:
            self.fieldnames = next(self._reader)
        row = next(self._reader)
        while row == []:
            row = next(self._reader)
        answer = dict()
        for index, name in enumerate(self.fieldnames):
            answer.__setitem__(
                name,
                row[index] if index < len(row) else self.restval,
            )
        if len(row) > len(self.fieldnames):
            answer.__setitem__(
                self.restkey, row[len(self.fieldnames):])
        return answer


class DictWriter:
    def __init__(
        self,
        csvfile,
        fieldnames,
        restval='',
        extrasaction='raise',
        dialect='excel',
        **parameters,
    ):
        self.fieldnames = fieldnames
        self.restval = restval
        self.extrasaction = extrasaction.lower()
        if self.extrasaction not in ('raise', 'ignore'):
            raise ValueError('extrasaction must be raise or ignore')
        self._writer = writer(csvfile, dialect, **parameters)

    def writeheader(self):
        return self.writerow(dict(zip(self.fieldnames, self.fieldnames)))

    def writerow(self, rowdict):
        extras = [key for key in rowdict if key not in self.fieldnames]
        if extras and self.extrasaction == 'raise':
            raise ValueError('dict contains fields not in fieldnames: ' + repr(extras))
        return self._writer.writerow([
            rowdict.get(key, self.restval) for key in self.fieldnames
        ])

    def writerows(self, rowdicts):
        for rowdict in rowdicts:
            self.writerow(rowdict)


def field_size_limit(new_limit=None):
    if new_limit is not None and new_limit < 0:
        raise OverflowError('Python int too large to convert to C ssize_t')
    return 131072
