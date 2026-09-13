from typing import NamedTuple


class Report(NamedTuple):
    category: str
    letter: str
    word: str


positional = Report("passed", ".", "PASSED")
assert positional.category == "passed"
assert positional.letter == "."
assert positional.word == "PASSED"
assert tuple(positional) == ("passed", ".", "PASSED")

keyword = Report(category="skipped", letter="s", word="SKIPPED")
assert keyword == ("skipped", "s", "SKIPPED")
assert keyword._asdict() == {
    "category": "skipped",
    "letter": "s",
    "word": "SKIPPED",
}
