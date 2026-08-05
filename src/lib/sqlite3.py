"""Python DB-API facade over Node's built-in synchronous SQLite engine.

This module intentionally owns the Python-visible cursor and transaction
semantics.  :mod:`node:sqlite` is only the storage backend, reached through
the explicit :mod:`sagejs.runtime` boundary.  The first implementation covers
the everyday DB-API surface: connections, cursors, parameterized statements,
transactions, scripts, iteration, exact 64-bit integers, and BLOBs.
"""

# Ruff 0.16's WASM build can report I001 while proposing the same import
# order. Keep the runtime boundary visually separate from typing imports.
# ruff: noqa: I001

from __future__ import annotations

from typing import Any, Iterator

import sagejs.runtime as runtime


apilevel = '2.0'
threadsafety = 1
paramstyle = 'qmark'
version = '2.6.0-sagejs'
version_info = (2, 6, 0)


class Warning(Exception):
    pass


class Error(Exception):
    pass


class InterfaceError(Error):
    pass


class DatabaseError(Error):
    pass


class DataError(DatabaseError):
    pass


class OperationalError(DatabaseError):
    pass


class IntegrityError(DatabaseError):
    pass


class InternalError(DatabaseError):
    pass


class ProgrammingError(DatabaseError):
    pass


class NotSupportedError(DatabaseError):
    pass


_sqlite = runtime.require_module('node:sqlite')
_database_sync = runtime.reflect.get(_sqlite, 'DatabaseSync')
_uint8_array = runtime.reflect.get(runtime.global_object, 'Uint8Array')


def _native_record(**values: Any) -> Any:
    result = runtime.object.create(None)
    for name, value in values.items():
        runtime.reflect.set(result, name, value)
    return result


def _call(target: Any, name: str, call_args: list[Any]) -> Any:
    method = runtime.reflect.get(target, name)
    return runtime.reflect.apply(method, target, call_args)


def _parameter(value: Any) -> Any:
    if value is None or isinstance(value, (str, float)):
        return value
    if value is True:
        return 1
    if value is False:
        return 0
    if runtime.is_exact_integer(value):
        return runtime.integer_bigint(value)
    if hasattr(value, '_bytes_values'):
        return runtime.reflect.construct(
            _uint8_array, [value._bytes_values()])
    raise ProgrammingError(
        'unsupported SQLite parameter type: ' + type(value).__name__)


def _parameters(parameters: Any) -> list[Any]:
    if parameters is None:
        return []
    if isinstance(parameters, dict):
        named = runtime.object.create(None)
        for name, value in parameters.items():
            runtime.reflect.set(named, str(name), _parameter(value))
        return [named]
    if isinstance(parameters, (list, tuple)):
        return [_parameter(value) for value in parameters]
    raise ProgrammingError('parameters must be a sequence or mapping')


def _value(value: Any) -> Any:
    if runtime.jstype(value) == 'bigint':
        return runtime.normalize_integer(value)
    if (
        _uint8_array is not runtime.undefined
        and runtime.instance_of(value, _uint8_array)
    ):
        return bytes([value[index] for index in range(len(value))])
    return value


def _statement_kind(sql: str) -> str:
    text = sql.lstrip()
    while text.startswith('--'):
        newline = text.find('\n')
        if newline < 0:
            return ''
        text = text[newline + 1:].lstrip()
    return text.split(None, 1)[0].upper() if text else ''


class Row:
    """A compact row supporting numeric and case-insensitive name lookup."""

    def __init__(self, cursor: Cursor, values: tuple[Any, ...]) -> None:
        self._values = values
        self._names = [item[0] for item in (cursor.description or [])]

    def __len__(self) -> int:
        return len(self._values)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._values)

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, str):
            lowered = key.lower()
            for index, name in enumerate(self._names):
                if name.lower() == lowered:
                    return self._values[index]
            raise IndexError('No item with that key')
        return self._values[key]

    def keys(self) -> list[str]:
        return list(self._names)


class Cursor:
    def __init__(self, connection: Connection) -> None:
        self.connection = connection
        self.arraysize = 1
        self.description: Any = None
        self.rowcount = -1
        self.lastrowid: Any = None
        self._rows: list[Any] = []
        self._position = 0
        self._closed = False

    def _check(self) -> None:
        if self._closed:
            raise ProgrammingError('Cannot operate on a closed cursor.')
        self.connection._check()

    def execute(self, sql: str, parameters: Any = None) -> Cursor:
        self._check()
        if not isinstance(sql, str):
            raise TypeError('execute() argument 1 must be str')
        kind = _statement_kind(sql)
        self.connection._before_statement(kind)
        options = _native_record(readBigInts=True, returnArrays=True)
        try:
            statement = _call(self.connection._database, 'prepare', [
                sql, options])
            columns = _call(statement, 'columns', [])
            call_args = _parameters(parameters)
            self._rows = []
            self._position = 0
            if len(columns):
                raw_rows = _call(statement, 'all', call_args)
                self.description = tuple([
                    (
                        str(runtime.reflect.get(column, 'name')),
                        None, None, None, None, None, None,
                    )
                    for column in columns
                ])
                for raw_row in raw_rows:
                    values = tuple([_value(value) for value in raw_row])
                    factory = self.connection.row_factory
                    self._rows.append(
                        values if factory is None else factory(self, values))
                self.rowcount = -1
                self.lastrowid = None
            else:
                result = _call(statement, 'run', call_args)
                self.description = None
                self.rowcount = int(runtime.number(runtime.reflect.get(
                    result, 'changes')))
                self.lastrowid = _value(runtime.reflect.get(
                    result, 'lastInsertRowid'))
                self.connection.total_changes += self.rowcount
            self.connection._after_statement(kind)
            return self
        except (Error, TypeError):
            raise
        except Exception as error:
            message = str(error)
            if 'constraint' in message.lower():
                raise IntegrityError(message)  # noqa: B904
            raise OperationalError(message)  # noqa: B904

    def executemany(self, sql: str, parameters: Any) -> Cursor:
        self._check()
        total = 0
        lastrowid = None
        for values in parameters:
            self.execute(sql, values)
            if self.description is not None:
                raise ProgrammingError(
                    'executemany() can only execute DML statements')
            total += self.rowcount
            lastrowid = self.lastrowid
        self.rowcount = total
        self.lastrowid = lastrowid
        return self

    def executescript(self, sql_script: str) -> Cursor:
        self._check()
        self.connection.commit()
        try:
            _call(self.connection._database, 'exec', [sql_script])
        except Exception as error:
            raise OperationalError(str(error))  # noqa: B904
        self.description = None
        self.rowcount = -1
        self.lastrowid = None
        self._rows = []
        self._position = 0
        return self

    def fetchone(self) -> Any:
        self._check()
        if self.description is None:
            raise ProgrammingError('the last operation did not produce rows')
        if self._position >= len(self._rows):
            return None
        value = self._rows[self._position]
        self._position += 1
        return value

    def fetchmany(self, size: Any = None) -> list[Any]:
        count = self.arraysize if size is None else int(size)
        answer = []
        while len(answer) < count:
            value = self.fetchone()
            if value is None:
                break
            answer.append(value)
        return answer

    def fetchall(self) -> list[Any]:
        self._check()
        if self.description is None:
            raise ProgrammingError('the last operation did not produce rows')
        answer = self._rows[self._position:]
        self._position = len(self._rows)
        return answer

    def close(self) -> None:
        self._closed = True
        self._rows = []

    def __iter__(self) -> Cursor:
        return self

    def __next__(self) -> Any:
        value = self.fetchone()
        if value is None:
            raise StopIteration
        return value


class Connection:
    def __init__(
        self,
        database: Any,
        timeout: float = 5.0,
        isolation_level: Any = '',
        **_keywords: Any,
    ) -> None:
        options = _native_record(
            timeout=max(0, int(float(timeout) * 1000)),
            readBigInts=True,
            returnArrays=True,
        )
        try:
            self._database = runtime.reflect.construct(
                _database_sync, [str(database), options])
        except Exception as error:
            raise OperationalError(str(error))  # noqa: B904
        self.isolation_level = isolation_level
        self.row_factory: Any = None
        self.text_factory: Any = str
        self.total_changes = 0
        self.in_transaction = False
        self._closed = False

    def _check(self) -> None:
        if self._closed:
            raise ProgrammingError('Cannot operate on a closed database.')

    def _before_statement(self, kind: str) -> None:
        if (
            self.isolation_level is not None
            and not self.in_transaction
            and kind in ('INSERT', 'UPDATE', 'DELETE', 'REPLACE')
        ):
            mode = str(self.isolation_level).strip().upper()
            if mode not in ('', 'DEFERRED', 'IMMEDIATE', 'EXCLUSIVE'):
                raise ValueError(
                    "isolation_level string must be '', 'DEFERRED', "
                    "'IMMEDIATE', or 'EXCLUSIVE'")
            _call(self._database, 'exec', [
                'BEGIN' + ((' ' + mode) if mode else '')])
            self.in_transaction = True

    def _after_statement(self, kind: str) -> None:
        if kind in ('BEGIN', 'SAVEPOINT'):
            self.in_transaction = True
        elif kind in ('COMMIT', 'END', 'ROLLBACK'):
            self.in_transaction = False

    def cursor(self, factory: Any = None) -> Cursor:
        self._check()
        cursor_type = Cursor if factory is None else factory
        return cursor_type(self)

    def execute(self, sql: str, parameters: Any = None) -> Cursor:
        return self.cursor().execute(sql, parameters)

    def executemany(self, sql: str, parameters: Any) -> Cursor:
        return self.cursor().executemany(sql, parameters)

    def executescript(self, sql_script: str) -> Cursor:
        return self.cursor().executescript(sql_script)

    def commit(self) -> None:
        self._check()
        if self.in_transaction:
            _call(self._database, 'exec', ['COMMIT'])
            self.in_transaction = False

    def rollback(self) -> None:
        self._check()
        if self.in_transaction:
            _call(self._database, 'exec', ['ROLLBACK'])
            self.in_transaction = False

    def close(self) -> None:
        if not self._closed:
            _call(self._database, 'close', [])
            self._closed = True
            self.in_transaction = False

    def __enter__(self) -> Connection:
        self._check()
        return self

    def __exit__(self, exception_type: Any, _value: Any, _traceback: Any) -> bool:
        if exception_type is None:
            self.commit()
        else:
            self.rollback()
        return False


def connect(
    database: Any,
    timeout: float = 5.0,
    detect_types: int = 0,
    isolation_level: Any = '',
    check_same_thread: bool = True,
    factory: Any = Connection,
    cached_statements: int = 128,
    uri: bool = False,
    **keywords: Any,
) -> Connection:
    del detect_types, check_same_thread, cached_statements, uri
    return factory(
        database,
        timeout=timeout,
        isolation_level=isolation_level,
        **keywords,
    )


Binary = bytes


def _sqlite_version() -> str:
    connection = connect(':memory:')
    try:
        return str(connection.execute('select sqlite_version()').fetchone()[0])
    finally:
        connection.close()


sqlite_version = _sqlite_version()
sqlite_version_info = tuple([
    int(part) for part in sqlite_version.split('.')])
