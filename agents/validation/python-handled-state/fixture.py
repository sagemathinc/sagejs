def active_error():
    try:
        raise
    except RuntimeError:
        return None
    except BaseException as error:
        return error


def ordinary(value):
    return value + 1


def control(n):
    total = 0
    for i in range(n):
        total += i + 1
    return total


def calls(n):
    total = 0
    for i in range(n):
        total += ordinary(i)
    return total


def plain_values(n):
    for i in range(n):
        yield i


def owned_values(n):
    try:
        raise ValueError(1)
    except ValueError:
        for i in range(n):
            yield i


def plain_create(n):
    result = []
    for _ in range(n):
        result.append(plain_values(2))
    return result


def owned_create(n):
    result = []
    for _ in range(n):
        result.append(owned_values(2))
    return result


def plain_resume(n):
    generator = plain_values(n)
    total = 0
    for _ in range(n):
        total += next(generator)
    generator.close()
    return total


def owned_resume(n):
    generator = owned_values(n)
    total = 0
    for _ in range(n):
        total += next(generator)
    generator.close()
    return total


def validate_created(items):
    for generator in items:
        assert next(generator) == 0
        assert next(generator) == 1
        generator.close()
    assert active_error() is None


def ownership_probe():
    owned = ValueError(1)

    def suspended():
        try:
            raise owned
        except ValueError:
            yield active_error() is owned
            assert active_error() is owned
            yield active_error() is owned

    assert active_error() is None
    generator = suspended()
    assert next(generator) is True
    assert active_error() is None
    caller = ValueError(2)
    try:
        raise caller
    except ValueError:
        assert active_error() is caller
        assert next(generator) is True
        assert active_error() is caller
        generator.close()
        assert active_error() is caller
    assert active_error() is None
    return True


def correctness():
    assert ownership_probe()
    assert control(100) == calls(100) == 5050
    assert plain_resume(100) == owned_resume(100) == 4950
    validate_created(plain_create(10))
    validate_created(owned_create(10))
    return True


assert correctness()
