from __python__ import hash_literals # type: ignore


def quoted_string(x):
    return '"' + x.replace(RegExp('\\\\', 'g'), '\\\\').replace(
        RegExp('"', 'g'), r'\"').replace(RegExp('\n', 'g'), '\\n') + '"'


def render_format_string(prefix, fmtspec):
    if fmtspec.indexOf('{') is -1:
        return quoted_string(prefix + '{' + fmtspec + '}')

    parts = [quoted_string(prefix + '{')]
    literal = ''
    pos = 0
    while pos < fmtspec.length:
        ch = fmtspec[pos]
        if ch is not '{':
            literal += ch
            pos += 1
            continue
        if literal:
            parts.push(quoted_string(literal))
            literal = ''
        depth = 1
        end = pos + 1
        expression = ''
        while end < fmtspec.length and depth:
            nested = fmtspec[end]
            if nested is '{':
                depth += 1
            elif nested is '}':
                depth -= 1
                if depth is 0:
                    break
            if depth:
                expression += nested
            end += 1
        parts.push('ρσ_str((' + expression + '))')
        pos = end + 1
    if literal:
        parts.push(quoted_string(literal))
    parts.push(quoted_string('}'))
    return parts.join('+')


def render_markup(markup):
    pos, key = 0, ''
    depth = 0
    quote = ''
    escaped = False
    while pos < markup.length:
        ch = markup[pos]
        if quote:
            key += ch
            if escaped:
                escaped = False
            elif ch is '\\':
                escaped = True
            elif ch is quote:
                quote = ''
            pos += 1
            continue
        if ch is '"' or ch is "'":
            quote = ch
        elif ch is '(' or ch is '[' or ch is '{':
            depth += 1
        elif ch is ')' or ch is ']' or ch is '}':
            depth -= 1
        elif (
            depth is 0
            and (
                ch is ':'
                or ch is '!' and markup[pos + 1] is not '='
            )
        ):
            break
        key += ch
        pos += 1
    fmtspec = markup[pos:]
    prefix = ''
    debug_key = key.trimEnd()
    if debug_key.endsWith('='):
        prefix = key
        key = debug_key[:-1]
        if not fmtspec:
            fmtspec = '!r'
    return (
        'ρσ_str.format(' + render_format_string(prefix, fmtspec)
        + ', (' + key + '))'
    )


def interpolate(template, raise_error):
    pos = in_brace = 0
    markup = ''
    ans = [""]
    quote = ''
    escaped = False
    while pos < template.length:
        ch = template[pos]
        if in_brace:
            if quote:
                markup += ch
                if escaped:
                    escaped = False
                elif ch is '\\':
                    escaped = True
                elif ch is quote:
                    quote = ''
            elif ch is '"' or ch is "'":
                quote = ch
                markup += ch
            elif ch is '{':
                in_brace += 1
                markup += '{'
            elif ch is '}':
                in_brace -= 1
                if in_brace > 0:
                    markup += '}'
                else:
                    ans.push(r'%js [markup]')
                    ans.push('')
            else:
                markup += ch
        else:
            if ch is '{':
                if template[pos + 1] is '{':
                    pos += 1
                    ans[-1] += '{'
                else:
                    in_brace = 1
                    markup = ''
            elif ch is '}':
                if template[pos + 1] is '}':
                    pos += 1
                    ans[-1] += '}'
                else:
                    raise_error("f-string: single '}' is not allowed")
            else:
                ans[-1] += ch

        pos += 1

    if in_brace:
        raise_error("expected '}' before end of string")

    if ans[-1] is '+':
        ans[-1] = ''
    for i in range(len(ans)):
        if jstype(ans[i]) is 'string':
            ans[i] = quoted_string(ans[i])
        else:
            ans[i] = '+' + render_markup.apply(this, ans[i]) + '+'
    return ans.join('')
