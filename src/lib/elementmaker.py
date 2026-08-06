"""Tiny lxml-style element factory for browser DOM and headless tests."""

import sagejs.runtime as runtime


html_elements = {
    'a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio',
    'b', 'base', 'big', 'body', 'blockquote', 'br', 'button', 'canvas',
    'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command',
    'datagrid', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir',
    'div', 'dl', 'dt', 'em', 'event-source', 'fieldset', 'figcaption',
    'figure', 'footer', 'font', 'form', 'header', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'hr', 'head', 'i', 'iframe', 'img', 'input', 'ins',
    'keygen', 'kbd', 'label', 'legend', 'li', 'm', 'map', 'menu', 'meter',
    'multicol', 'nav', 'nextid', 'ol', 'output', 'optgroup', 'option', 'p',
    'pre', 'progress', 'q', 's', 'samp', 'script', 'section', 'select',
    'small', 'sound', 'source', 'spacer', 'span', 'strike', 'strong', 'style',
    'sub', 'sup', 'table', 'tbody', 'td', 'textarea', 'time', 'tfoot', 'th',
    'thead', 'tr', 'tt', 'u', 'ul', 'var', 'video', 'maction', 'math',
    'merror', 'mfrac', 'mi', 'mmultiscripts', 'mn', 'mo', 'mover',
    'mpadded', 'mphantom', 'mprescripts', 'mroot', 'mrow', 'mspace', 'msqrt',
    'mstyle', 'msub', 'msubsup', 'msup', 'mtable', 'mtd', 'mtext', 'mtr',
    'munder', 'munderover', 'none', 'animate', 'animateColor',
    'animateMotion', 'animateTransform', 'clipPath', 'circle', 'defs', 'desc',
    'ellipse', 'font-face', 'font-face-name', 'font-face-src', 'g', 'glyph',
    'hkern', 'linearGradient', 'line', 'marker', 'metadata', 'missing-glyph',
    'mpath', 'path', 'polygon', 'polyline', 'radialGradient', 'rect', 'set',
    'stop', 'svg', 'switch', 'text', 'title', 'tspan', 'use',
}

html5_tags = html_elements


class _HeadlessElement:
    def __init__(self, name):
        self.name = name
        self.children = []
        self.attributes = {}

    def setAttribute(self, name, value):
        self.attributes[name] = value

    def appendChild(self, child):
        self.children.append(child)

    def addEventListener(self, name, callback):
        self.attributes['on' + name] = callback


class _HeadlessDocument:
    def createTextNode(self, value):
        return value

    def createElement(self, name):
        return _HeadlessElement(name)


def _call(target, name, call_args):
    method = runtime.reflect.get(target, name)
    if method is runtime.undefined:
        method = getattr(target, name)
        return method(*call_args)
    return runtime.reflect.apply(method, target, call_args)


class ElementMaker:
    """Callable factory whose attributes name HTML, SVG, or MathML tags."""

    def __init__(self, document):
        self.document = document
        for tag in html5_tags:
            setattr(self, tag, self._factory(tag))

    def _factory(self, tag):
        def make(*children, **attributes):
            return self(tag, *children, **attributes)

        return make

    def __call__(self, tag, *children, **attributes):
        element = _call(self.document, 'createElement', [tag])
        for name in runtime.reflect.ownKeys(attributes):
            if runtime.jstype(name) != 'string':
                continue
            value = runtime.reflect.get(attributes, name)
            html_name = str.replace(str.rstrip(name, '_'), '_', '-')
            if callable(value):
                event_name = name[2:] if name.startswith('on') else name
                _call(element, 'addEventListener', [event_name, value])
            elif value is True:
                _call(element, 'setAttribute', [html_name, html_name])
            elif isinstance(value, str):
                _call(element, 'setAttribute', [html_name, value])
        for child in children:
            if isinstance(child, str):
                child = _call(self.document, 'createTextNode', [child])
            _call(element, 'appendChild', [child])
        return element

    def __getattr__(self, tag):
        if tag not in html5_tags:
            raise AttributeError(tag)

        return self._factory(tag)


def maker_for_document(document):
    """Return an element maker bound to *document*."""
    return ElementMaker(document)


_document = runtime.reflect.get(runtime.global_object, 'document')
if _document is runtime.undefined:
    _document = _HeadlessDocument()

E = maker_for_document(_document)
