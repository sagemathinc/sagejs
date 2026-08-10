"""Unix shell-style filename matching."""

import os


def _class_match(character, specification):
    negate = specification.startswith("!") or specification.startswith("^")
    if negate:
        specification = specification[1:]
    matched = False
    index = 0
    while index < len(specification):
        if index + 2 < len(specification) and specification[index + 1] == "-":
            matched = matched or (
                specification[index] <= character <= specification[index + 2]
            )
            index += 3
        else:
            matched = matched or character == specification[index]
            index += 1
    return not matched if negate else matched


def _match(name, pattern, name_index=0, pattern_index=0, memo=None):
    if memo is None:
        memo = dict()
    key = (name_index, pattern_index)
    if key in memo:
        return memo[key]
    while pattern_index < len(pattern):
        token = pattern[pattern_index]
        if token == "*":
            while pattern_index < len(pattern) and pattern[pattern_index] == "*":
                pattern_index += 1
            if pattern_index == len(pattern):
                memo.__setitem__(key, True)
                return True
            for position in range(name_index, len(name) + 1):
                if _match(name, pattern, position, pattern_index, memo):
                    memo.__setitem__(key, True)
                    return True
            memo.__setitem__(key, False)
            return False
        if name_index >= len(name):
            memo.__setitem__(key, False)
            return False
        if token == "?":
            name_index += 1
            pattern_index += 1
            continue
        if token == "[":
            end = pattern.find("]", pattern_index + 1)
            if end >= 0:
                if not _class_match(name[name_index], pattern[pattern_index + 1 : end]):
                    memo.__setitem__(key, False)
                    return False
                name_index += 1
                pattern_index = end + 1
                continue
        if token != name[name_index]:
            memo.__setitem__(key, False)
            return False
        name_index += 1
        pattern_index += 1
    answer = name_index == len(name)
    memo.__setitem__(key, answer)
    return answer


def fnmatchcase(name, pat):
    return _match(name, pat)


def fnmatch(name, pat):
    return fnmatchcase(os.path.normcase(name), os.path.normcase(pat))


def filter(names, pat):
    normalized_pattern = os.path.normcase(pat)
    answer = []
    for name in names:
        if fnmatchcase(os.path.normcase(name), normalized_pattern):
            answer.append(name)
    return answer


def translate(pat):
    special = ".^$+{}()|\\"
    answer = "(?s:"
    index = 0
    while index < len(pat):
        token = pat[index]
        index += 1
        if token == "*":
            answer += ".*"
        elif token == "?":
            answer += "."
        elif token == "[":
            end = pat.find("]", index)
            if end < 0:
                answer += "\\["
            else:
                specification = pat[index:end]
                index = end + 1
                if specification.startswith("!"):
                    specification = "^" + specification[1:]
                answer += "[" + specification + "]"
        elif token in special:
            answer += "\\" + token
        else:
            answer += token
    return answer + ")\\z"
