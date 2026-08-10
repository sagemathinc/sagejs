"""Small, compatible subset of :mod:`xml.etree.ElementTree`.

The implementation covers construction and serialization, including the API
used by pytest's built-in JUnit XML reporter.  Parsing is intentionally left
for a later XML compatibility milestone.
"""

from __future__ import annotations


def _escape_text(value):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _escape_attribute(value):
    return _escape_text(value).replace('"', "&quot;")


class Element:
    def __init__(self, tag, attrib=None, **extra):
        self.tag = tag
        self.attrib = {} if attrib is None else dict(attrib)
        self.attrib.update(extra)
        self.text = None
        self.tail = None
        self._children = []

    def append(self, element):
        self._children.append(element)

    def extend(self, elements):
        self._children.extend(elements)

    def insert(self, index, element):
        self._children.insert(index, element)

    def set(self, key, value):
        self.attrib[key] = value

    def get(self, key, default=None):
        return self.attrib.get(key, default)

    def items(self):
        return self.attrib.items()

    def __iter__(self):
        return iter(self._children)

    def __len__(self):
        return len(self._children)

    def __getitem__(self, index):
        return self._children[index]


def SubElement(parent, tag, attrib=None, **extra):
    element = Element(tag, attrib, **extra)
    parent.append(element)
    return element


def _serialize(element, short_empty_elements=True):
    attributes = "".join(
        " " + str(name) + '="' + _escape_attribute(value) + '"'
        for name, value in element.attrib.items()
    )
    text = "" if element.text is None else _escape_text(element.text)
    children = "".join(
        _serialize(child, short_empty_elements)
        + ("" if child.tail is None else _escape_text(child.tail))
        for child in element
    )
    if not text and not children and short_empty_elements:
        return "<" + str(element.tag) + attributes + " />"
    return (
        "<"
        + str(element.tag)
        + attributes
        + ">"
        + text
        + children
        + "</"
        + str(element.tag)
        + ">"
    )


def tostring(
    element,
    encoding="us-ascii",
    method="xml",
    *,
    xml_declaration=None,
    default_namespace=None,
    short_empty_elements=True,
):
    del default_namespace
    if method != "xml":
        raise ValueError("unknown method " + repr(method))
    answer = _serialize(element, short_empty_elements)
    if xml_declaration:
        declared_encoding = "utf-8" if encoding == "unicode" else encoding
        answer = "<?xml version='1.0' encoding='" + declared_encoding + "'?>\n" + answer
    if encoding == "unicode":
        return answer
    return answer.encode(encoding)


class ElementTree:
    def __init__(self, element=None, file=None):
        if file is not None:
            raise NotImplementedError("ElementTree parsing is not available")
        self._root = element

    def getroot(self):
        return self._root

    def write(
        self,
        file_or_filename,
        encoding="us-ascii",
        xml_declaration=None,
        default_namespace=None,
        method="xml",
        *,
        short_empty_elements=True,
    ):
        data = tostring(
            self._root,
            encoding=encoding,
            method=method,
            xml_declaration=xml_declaration,
            default_namespace=default_namespace,
            short_empty_elements=short_empty_elements,
        )
        if hasattr(file_or_filename, "write"):
            file_or_filename.write(data)
            return
        mode = "w" if encoding == "unicode" else "wb"
        with open(file_or_filename, mode) as output:
            output.write(data)


__all__ = ["Element", "ElementTree", "SubElement", "tostring"]
