"""Shell-like word splitting used by command-line configuration."""

from __future__ import annotations


def split(text, comments=False, posix=True):
    del posix
    words = []
    current = []
    quote_character = None
    escaped = False
    index = 0
    while index < len(text):
        character = text[index]
        if escaped:
            current.append(character)
            escaped = False
        elif character == "\\" and quote_character != "'":
            escaped = True
        elif quote_character is not None:
            if character == quote_character:
                quote_character = None
            else:
                current.append(character)
        elif character in ("'", '"'):
            quote_character = character
        elif comments and character == "#":
            while index < len(text) and text[index] != "\n":
                index += 1
            if current:
                words.append("".join(current))
                current = []
        elif character.isspace():
            if current:
                words.append("".join(current))
                current = []
        else:
            current.append(character)
        index += 1
    if quote_character is not None:
        raise ValueError("No closing quotation")
    if escaped:
        raise ValueError("No escaped character")
    if current:
        words.append("".join(current))
    return words


def quote(text):
    text = str(text)
    if text and all(
        character.isalnum() or character in "@%_-+=:,./" for character in text
    ):
        return text
    return "'" + text.replace("'", "'\"'\"'") + "'"


def join(words):
    return " ".join(quote(word) for word in words)
