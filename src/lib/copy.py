"""Shallow and recursive copying compatible with ordinary Python objects."""

import sagejs.runtime as runtime


def copy(value):
    method = getattr(value, "__copy__", None)
    if method is not None:
        return method()
    if isinstance(value, list):
        return value[:]
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, set):
        return set(value)
    if isinstance(value, tuple) or isinstance(
        value, (str, bytes, int, float, bool, type(None))
    ):
        return value
    prototype = runtime.reflect.getPrototypeOf(value)
    answer = runtime.object.create(prototype)
    runtime.object.assign(answer, value)
    return answer


def deepcopy(value, memo=None):
    if memo is None:
        memo = {}
    identity = id(value)
    if identity in memo:
        return memo[identity]
    method = getattr(value, "__deepcopy__", None)
    if method is not None:
        return method(memo)
    if isinstance(value, (str, bytes, int, float, bool, type(None))):
        return value
    if isinstance(value, list):
        answer = []
        memo[identity] = answer
        answer.extend(deepcopy(item, memo) for item in value)
        return answer
    if isinstance(value, tuple):
        return tuple(deepcopy(item, memo) for item in value)
    if isinstance(value, dict):
        answer = {}
        memo[identity] = answer
        for key, item in value.items():
            answer[deepcopy(key, memo)] = deepcopy(item, memo)
        return answer
    if isinstance(value, set):
        answer = set()
        memo[identity] = answer
        for item in value:
            answer.add(deepcopy(item, memo))
        return answer
    answer = copy(value)
    memo[identity] = answer
    for name, item in vars(value).items():
        setattr(answer, name, deepcopy(item, memo))
    return answer


Error = Exception
