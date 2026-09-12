"""State-only differential cases; no traceback or chaining assertions."""

import sys
import types


def active(error):
    assert sys.exception() is error
    assert sys.exc_info()[1] is error


def bare():
    raise


def reraised(error):
    try:
        bare()
    except BaseException as caught:
        assert caught is error


def test_sync_restore():
    active(None)
    outer = ValueError("outer")
    inner = TypeError("inner")
    try:
        raise outer
    except ValueError:
        active(outer)
        reraised(outer)
        try:
            raise inner
        except TypeError:
            active(inner)
            reraised(inner)
        active(outer)
        reraised(outer)
    active(None)
    try:
        bare()
    except RuntimeError as error:
        assert str(error) == "No active exception to reraise"
    active(None)


def test_explicit_and_unmatched():
    error = ValueError("identity")

    def relay():
        try:
            raise error
        except ValueError as caught:
            raise caught

    try:
        try:
            relay()
        except TypeError:
            assert False
    except ValueError as caught:
        assert caught is error
        active(error)
    active(None)


def test_finally_pending():
    outer = ValueError("pending")
    inner = TypeError("nested")
    try:
        try:
            raise outer
        finally:
            active(outer)
            reraised(outer)
            try:
                raise inner
            except TypeError:
                active(inner)
            active(outer)
    except ValueError as caught:
        assert caught is outer
    active(None)


def test_finally_else_and_return():
    error = ValueError("else")
    try:
        try:
            pass
        except TypeError:
            assert False
        else:
            raise error
        finally:
            active(error)
    except ValueError as caught:
        assert caught is error
    active(None)

    def suppressed():
        try:
            raise error
        finally:
            active(error)
            return 42

    assert suppressed() == 42
    active(None)
    for i in range(2):
        try:
            raise error
        finally:
            active(error)
            if i == 0:
                continue
            break
    active(None)


def test_handler_return_and_alias():
    error = ValueError("return")

    def f():
        try:
            raise error
        except ValueError as alias:
            active(alias)
            return alias

    assert f() is error
    active(None)
    try:
        raise error
    except ValueError as alias:
        pass
    try:
        alias
    except NameError:
        pass
    else:
        assert False
    active(None)


def test_finally_replaces_pending():
    pending = ValueError("pending")
    replacement = TypeError("replacement")
    try:
        try:
            raise pending
        finally:
            active(pending)
            raise replacement
    except TypeError as error:
        assert error is replacement
        active(replacement)
    active(None)


def test_context_exit_bare_raise():
    pending = ValueError("with-reraise")

    class Context:
        def __enter__(self):
            return self

        def __exit__(self, kind, value, tb):
            assert value is pending
            active(pending)
            bare()

    try:
        with Context():
            raise pending
    except ValueError as error:
        assert error is pending
        active(pending)
    active(None)


def test_context_exit():
    error = ValueError("with")

    class Context:
        def __enter__(self):
            return self

        def __exit__(self, kind, value, tb):
            assert value is error
            active(error)
            reraised(error)
            return True

    with Context():
        raise error
    active(None)


def test_generator_owned_and_inherited():
    owned = ValueError("owned")
    caller = TypeError("caller")

    def generator():
        try:
            raise owned
        except ValueError:
            active(owned)
            yield 1
            active(owned)
            reraised(owned)
            yield 2
        active(caller)
        yield 3

    g = generator()
    assert next(g) == 1
    active(None)
    try:
        raise caller
    except TypeError:
        assert g.send(None) == 2
        active(caller)
        assert next(g) == 3
        active(caller)
    g.close()
    active(None)


def test_generator_alternating_callers():
    first = ValueError("first")
    second = TypeError("second")

    def generator():
        yield sys.exception()
        yield sys.exception()
        yield sys.exception()

    g = generator()
    for error in (first, second):
        try:
            raise error
        except BaseException:
            assert next(g) is error
            active(error)
        active(None)
    assert next(g) is None
    g.close()
    active(None)


def test_generator_throw_close():
    owned = ValueError("owned")
    injected = TypeError("injected")
    events = []

    def generator():
        try:
            raise owned
        except ValueError:
            try:
                yield 1
            except TypeError as caught:
                assert caught is injected
                active(injected)
                yield 2
            finally:
                events.append(type(sys.exception()).__name__)

    g = generator()
    assert next(g) == 1
    active(None)
    assert g.throw(injected) == 2
    active(None)
    g.close()
    assert events == ["GeneratorExit"]
    active(None)
    assert next(g, "done") == "done"
    active(None)


def test_generator_completion():
    owned = ValueError("owned")

    def generator():
        try:
            raise owned
        except ValueError:
            yield 1
            return 42

    g = generator()
    assert next(g) == 1
    try:
        g.send(None)
    except StopIteration as error:
        assert error.value == 42
        active(error)
    active(None)
    try:
        g.throw(owned)
    except ValueError as error:
        assert error is owned
    active(None)


def test_generator_reentrancy():
    owned = ValueError("owned")

    def generator():
        try:
            raise owned
        except ValueError:
            try:
                next(g)
            except ValueError as error:
                assert "already" in str(error)
            active(owned)
            yield 1

    g = generator()
    assert next(g) == 1
    active(None)
    g.close()
    active(None)


def test_generator_throw_return():
    injected = TypeError("injected")

    def generator():
        try:
            yield 1
        except TypeError as error:
            assert error is injected
            active(injected)
            return 42

    g = generator()
    assert next(g) == 1
    try:
        g.throw(injected)
    except StopIteration as done:
        assert done.value == 42
        active(done)
    active(None)
    assert next(g, "done") == "done"
    active(None)


def test_generator_close_yield():
    owned = ValueError("owned")
    events = []

    def generator():
        try:
            raise owned
        except ValueError:
            try:
                yield 1
            finally:
                pending = sys.exception()
                assert isinstance(pending, GeneratorExit)
                yield 2
                active(pending)
                events.append("resumed-finally")

    g = generator()
    assert next(g) == 1
    try:
        g.close()
    except RuntimeError as error:
        assert "ignored GeneratorExit" in str(error)
    active(None)
    try:
        next(g)
    except GeneratorExit:
        pass
    assert events == ["resumed-finally"]
    active(None)
    assert next(g, "done") == "done"
    active(None)


def test_generator_delegation():
    parent_error = ValueError("parent")
    child_error = TypeError("child")

    def child():
        try:
            raise child_error
        except TypeError:
            yield sys.exception()
            active(child_error)
            return 42

    def parent():
        try:
            raise parent_error
        except ValueError:
            result = yield from child()
            assert result == 42
            active(parent_error)
            yield sys.exception()

    g = parent()
    assert next(g) is child_error
    active(None)
    assert next(g) is parent_error
    active(None)
    g.close()
    active(None)


def test_generator_comprehension():
    first = ValueError("first")
    second = TypeError("second")
    g = (sys.exception() for _ in range(2))
    for error in (first, second):
        try:
            raise error
        except BaseException:
            assert next(g) is error
        active(None)
    assert next(g, "done") == "done"
    active(None)


@types.coroutine
def pause():
    return (yield "pause")


def test_manual_await():
    first = ValueError("first")
    second = TypeError("second")

    async def task(error):
        try:
            raise error
        except BaseException:
            assert await pause() == "resumed"
            active(error)
            reraised(error)
            return error

    a, b = task(first), task(second)
    assert a.send(None) == "pause"
    active(None)
    assert b.send(None) == "pause"
    active(None)
    for task, error in ((b, second), (a, first)):
        try:
            task.send("resumed")
        except StopIteration as done:
            assert done.value is error
        active(None)


def test_async_context_exit():
    error = ValueError("async-with")

    class Context:
        async def __aenter__(self):
            return self

        async def __aexit__(self, kind, value, tb):
            assert value is error
            active(error)
            await pause()
            active(error)
            reraised(error)
            return True

    async def task():
        async with Context():
            raise error
        active(None)

    task = task()
    assert task.send(None) == "pause"
    active(None)
    try:
        task.send(None)
    except StopIteration:
        pass
    active(None)


def test_manual_await_throw_close():
    injected = TypeError("injected")
    events = []

    async def task():
        try:
            try:
                await pause()
            except TypeError as error:
                assert error is injected
                active(injected)
                await pause()
        finally:
            assert isinstance(sys.exception(), GeneratorExit)
            events.append("closed")

    task = task()
    assert task.send(None) == "pause"
    active(None)
    assert task.throw(injected) == "pause"
    active(None)
    task.close()
    assert events == ["closed"]
    active(None)


def test_handler_selector_suspends():
    owned = ValueError("selector")

    def generator():
        try:
            raise owned
        except (yield sys.exception()):
            active(owned)
            yield owned

    g = generator()
    assert next(g) is owned
    active(None)
    assert g.send(ValueError) is owned
    active(None)
    g.close()
    active(None)


def test_nested_defaults_and_decorators_suspend():
    owned = ValueError("definition")

    def identity(function):
        return function

    def generator():
        try:
            raise owned
        except ValueError:

            def inner(value=(yield sys.exception())):
                return value

            active(owned)

            @(yield sys.exception())
            def decorated():
                return inner()

            active(owned)
            # Calling this nested default-bearing function has a distinct open
            # generator-classification defect, retained in its own full oracle.
            yield sys.exception()

    g = generator()
    assert next(g) is owned
    active(None)
    assert g.send(42) is owned
    active(None)
    assert g.send(identity) is owned
    active(None)
    g.close()
    active(None)


def test_plain_delegate_and_helpers():
    owned = ValueError("child")
    caller = TypeError("caller")

    def helper():
        try:
            raise owned
        except ValueError:
            active(owned)

    def child():
        try:
            raise owned
        except ValueError:
            yield sys.exception()
            yield sys.exception()

    def parent():
        helper()
        yield from child()
        yield sys.exception()

    g = parent()
    assert next(g) is owned
    active(None)
    try:
        raise caller
    except TypeError:
        assert next(g) is owned
        active(caller)
        assert next(g) is caller
        active(caller)
    active(None)
    g.close()
    active(None)


def test_plain_manual_await_resumer():
    first = ValueError("first")
    second = TypeError("second")

    @types.coroutine
    def plain_pause():
        yield sys.exception()

    async def task():
        await plain_pause()
        await plain_pause()

    g = task()
    for error in (first, second):
        try:
            raise error
        except BaseException:
            assert g.send(None) is error
            active(error)
        active(None)
    g.close()
    active(None)


def test_plain_iterator_error_restores_caller():
    owned = ValueError("iterator")
    caller = TypeError("caller")

    class Source:
        def __iter__(self):
            return self

        def __next__(self):
            try:
                raise owned
            except ValueError:
                active(owned)
                raise

    def generator():
        yield from Source()

    g = generator()
    try:
        raise caller
    except TypeError:
        try:
            next(g)
        except ValueError as error:
            assert error is owned
            active(owned)
        active(caller)
    active(None)
    assert next(g, None) is None
    active(None)
