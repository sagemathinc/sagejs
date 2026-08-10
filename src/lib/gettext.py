"""Small GNU-gettext compatible translation facade.

Translation catalogs used by Sage.js are already decoded mappings.  The only
nontrivial part is evaluating the restricted C-like plural expression; the
recursive-descent parser below intentionally does not use `eval`.
"""


class _PluralParser:
    def __init__(self, source, number):
        self.source = source
        self.number = number
        self.position = 0

    def _space(self):
        while self.position < len(self.source) and self.source[self.position].isspace():
            self.position += 1

    def _take(self, token):
        self._space()
        if self.source.startswith(token, self.position):
            self.position += len(token)
            return True
        return False

    def parse(self):
        return self._conditional()

    def _conditional(self):
        condition = self._or()
        if self._take("?"):
            truthy = self._conditional()
            if not self._take(":"):
                raise ValueError("invalid plural expression")
            falsey = self._conditional()
            return truthy if condition else falsey
        return condition

    def _or(self):
        value = self._and()
        while self._take("||"):
            right = self._and()
            value = 1 if value or right else 0
        return value

    def _and(self):
        value = self._compare()
        while self._take("&&"):
            right = self._compare()
            value = 1 if value and right else 0
        return value

    def _compare(self):
        value = self._modulo()
        for token in ("==", "!=", "<=", ">=", "<", ">"):
            if self._take(token):
                right = self._modulo()
                if token == "==":
                    return 1 if value == right else 0
                if token == "!=":
                    return 1 if value != right else 0
                if token == "<=":
                    return 1 if value <= right else 0
                if token == ">=":
                    return 1 if value >= right else 0
                if token == "<":
                    return 1 if value < right else 0
                return 1 if value > right else 0
        return value

    def _modulo(self):
        value = self._atom()
        while self._take("%"):
            value %= self._atom()
        return value

    def _atom(self):
        self._space()
        if self._take("!"):
            return 0 if self._atom() else 1
        if self._take("("):
            value = self._conditional()
            if not self._take(")"):
                raise ValueError("invalid plural expression")
            return value
        if self._take("n"):
            return self.number
        start = self.position
        while self.position < len(self.source) and self.source[self.position].isdigit():
            self.position += 1
        if start == self.position:
            raise ValueError("invalid plural expression")
        return int(self.source[start : self.position])


def _plural_expression(description):
    text = description or "nplurals=2; plural=(n != 1);"
    marker = "plural="
    start = text.find(marker)
    if start < 0:
        raise ValueError("plural expression not found")
    answer = text[start + len(marker) :]
    semicolon = answer.find(";")
    return answer if semicolon < 0 else answer[:semicolon]


def _get_plural_forms_function(description):
    expression = _plural_expression(description)

    def plural(number):
        return int(_PluralParser(expression, number).parse())

    return plural


_gettext = lambda text: text
_ngettext = lambda text, plural, number: text if number == 1 else plural


def gettext(text):
    return _gettext(text)


def ngettext(text, plural, number):
    return _ngettext(text, plural, number)


class Translations:
    def __init__(self, translation_data=None):
        data = translation_data or {"entries": {}}
        self.language = data.get("language")
        self.translations = [
            (
                data,
                _get_plural_forms_function(data.get("plural_forms")),
            )
        ]

    def add_fallback(self, fallback=None):
        data = fallback or {"entries": {}}
        self.translations.append(
            (
                data,
                _get_plural_forms_function(data.get("plural_forms")),
            )
        )

    def gettext(self, text):
        for data, unused in self.translations:
            values = data.get("entries", {})
            if text in values:
                return values[text][0]
        return text

    def ngettext(self, text, plural, number):
        for data, selector in self.translations:
            values = data.get("entries", {})
            if text in values:
                options = values[text]
                index = selector(number)
                if index < len(options) and options[index]:
                    return options[index]
        return text if number == 1 else plural

    def install(self):
        global _gettext, _ngettext
        _gettext = self.gettext
        _ngettext = self.ngettext


def install(translation_data=None):
    translation = Translations(translation_data)
    translation.install()
    for callback in register_callback.install_callbacks:
        try:
            callback(translation)
        except Exception:
            pass
    return translation


def register_callback(function):
    register_callback.install_callbacks.append(function)


register_callback.install_callbacks = []


NullTranslations = Translations
