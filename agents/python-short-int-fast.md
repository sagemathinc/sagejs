# Short decimal `int()` parsing

`packaging.version.Version` repeatedly converts one-character release segments
such as `"1"` and `"0"` with `int()`. The general parser trims the string,
handles signs and prefixes, then constructs and normalizes `BigInt` values for
each character. For a single ASCII decimal digit with no explicit base, the
result is exactly the corresponding small integer, so this case now returns
directly. All other strings and explicit-base calls retain the general parser.

The parser also consolidates sign/prefix membership checks and removes the
redundant `saw_digit` state: an empty input is already rejected, a leading
underscore raises immediately, and `previous_was_digit` alone detects a
trailing underscore. The new CPython differential covers single digits,
whitespace, signs, underscores, bases, a large integer, and invalid input.

On a same-host 10,000-call `packaging==26.2` probe, `tuple(map(int, parts))`
fell from about 300 to 224 ms, and construction of `Version('1.0')` from
about 647 to 587 ms. In the repository's isolated-cache, seven-sample package
runner, the warm 1,000-call workflow changed from 1,385 ms on the #334 parent
to 1,351 ms on the final source; the sample ranges did not overlap. CPython
took about 12.0 ms, so this remains roughly 113 times slower and is still a
critical cliff.
These are single-host provisional comparisons, not cross-host qualification.
Cold import remains roughly 3.6 seconds and is not addressed by this change.

The unchanged core-runtime source budget is 911,942 / 912,000 bytes after
consolidation. The full local build, routine suite, focused differential,
startup check, and package budget passed; generated reference documentation
was refreshed. Cross-platform and browser checks are PR gates.
