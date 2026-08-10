"""Compact argparse-compatible command-line parser.

This implements the public and small private surface used by pytest and other
command-line Python packages.  It intentionally favors compatible parsing
semantics over CPython's extensive help-layout customization internals.
"""

from __future__ import annotations

import sys
from typing import Any


SUPPRESS = "==SUPPRESS=="


class ArgumentError(Exception):
    def __init__(self, argument, message):
        self.argument_name = getattr(argument, "dest", None)
        self.message = message
        super().__init__(message)


class ArgumentTypeError(Exception):
    pass


class Namespace:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def __repr__(self):
        values = ", ".join(
            name + "=" + repr(value) for name, value in sorted(self.__dict__.items())
        )
        return "Namespace(" + values + ")"

    def __contains__(self, name):
        return hasattr(self, name)


class Action:
    def __init__(
        self,
        option_strings,
        dest,
        nargs=None,
        const=None,
        default=None,
        type=None,
        choices=None,
        required=False,
        help=None,
        metavar=None,
        **kwargs,
    ):
        del kwargs
        self.option_strings = list(option_strings)
        self.dest = dest
        self.nargs = nargs
        self.const = const
        self.default = default
        self.type = type
        self.choices = choices
        self.required = required
        self.help = help
        self.metavar = metavar

    def __call__(self, parser, namespace, values, option_string=None):
        del parser, option_string
        setattr(namespace, self.dest, values)


class _StoreTrueAction(Action):
    def __init__(self, option_strings, dest, default=False, **kwargs):
        super().__init__(
            option_strings, dest, nargs=0, const=True, default=default, **kwargs
        )

    def __call__(self, parser, namespace, values, option_string=None):
        del parser, values, option_string
        setattr(namespace, self.dest, True)


class _StoreFalseAction(Action):
    def __init__(self, option_strings, dest, default=True, **kwargs):
        super().__init__(
            option_strings, dest, nargs=0, const=False, default=default, **kwargs
        )

    def __call__(self, parser, namespace, values, option_string=None):
        del parser, values, option_string
        setattr(namespace, self.dest, False)


class _StoreConstAction(Action):
    def __init__(self, option_strings, dest, const=None, **kwargs):
        super().__init__(option_strings, dest, nargs=0, const=const, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        del parser, values, option_string
        setattr(namespace, self.dest, self.const)


class _AppendAction(Action):
    def __call__(self, parser, namespace, values, option_string=None):
        del parser, option_string
        current = getattr(namespace, self.dest, None)
        current = [] if current is None else list(current)
        current.append(values)
        setattr(namespace, self.dest, current)


class _AppendConstAction(_AppendAction):
    def __init__(self, option_strings, dest, const=None, **kwargs):
        super().__init__(option_strings, dest, nargs=0, const=const, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        super().__call__(parser, namespace, self.const, option_string)


class _CountAction(Action):
    def __init__(self, option_strings, dest, default=None, **kwargs):
        super().__init__(option_strings, dest, nargs=0, default=default, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        del parser, values, option_string
        current = getattr(namespace, self.dest, None)
        setattr(namespace, self.dest, 1 if current is None else current + 1)


class HelpFormatter:
    def __init__(
        self, prog, indent_increment=2, max_help_position=24, width=None, **kwargs
    ):
        del indent_increment, max_help_position, kwargs
        self._prog = prog
        self._width = 80 if width is None else width

    def _format_action_invocation(self, action):
        if action.option_strings:
            suffix = (
                ""
                if action.nargs == 0
                else " " + (action.metavar or action.dest.upper())
            )
            return ", ".join(name + suffix for name in action.option_strings)
        return action.metavar or action.dest

    def _split_lines(self, text, width):
        del width
        return text.splitlines()


class _ArgumentGroup:
    def __init__(self, container, title=None, description=None):
        self._container = container
        self.title = title
        self.description = description
        self._actions = []

    def add_argument(self, *args, **kwargs):
        action = self._container.add_argument(*args, **kwargs)
        self._actions.append(action)
        return action


class ArgumentParser:
    def __init__(
        self,
        prog=None,
        usage=None,
        description=None,
        epilog=None,
        parents=(),
        formatter_class=HelpFormatter,
        prefix_chars="-",
        fromfile_prefix_chars=None,
        argument_default=None,
        conflict_handler="error",
        add_help=True,
        allow_abbrev=True,
        exit_on_error=True,
        **kwargs,
    ):
        del parents, prefix_chars, argument_default, conflict_handler
        del allow_abbrev, exit_on_error, kwargs
        self.prog = sys.argv[0] if prog is None else prog
        self.usage = usage
        self.description = description
        self.epilog = epilog
        self.formatter_class = formatter_class
        self.fromfile_prefix_chars = fromfile_prefix_chars
        self._actions = []
        self._action_groups = []
        self._option_string_actions = {}
        self._positionals = []
        self._defaults = {}
        if add_help:
            self.add_argument(
                "-h", "--help", action="help", help="show this help message and exit"
            )

    def add_argument_group(self, title=None, description=None):
        group = _ArgumentGroup(self, title, description)
        self._action_groups.append(group)
        return group

    def register(self, registry_name, value, object):
        del registry_name, value, object

    def set_defaults(self, **kwargs):
        self._defaults.update(kwargs)

    def get_default(self, dest):
        return self._defaults.get(dest)

    def add_argument(self, *names, **kwargs):
        option_strings = [name for name in names if name.startswith("-")]
        positional = not option_strings
        if positional:
            dest = names[0]
        else:
            dest = kwargs.pop("dest", None)
            if dest is None:
                long_names = [name for name in option_strings if name.startswith("--")]
                # CPython derives the destination from the first long option;
                # later spellings are aliases (``--setupplan`` followed by
                # ``--setup-plan`` must still create ``namespace.setupplan``).
                source = long_names[0] if long_names else option_strings[-1]
                dest = source.lstrip("-").replace("-", "_")
        action_spec = kwargs.pop("action", "store")
        constructors = {
            "store": Action,
            "store_true": _StoreTrueAction,
            "store_false": _StoreFalseAction,
            "store_const": _StoreConstAction,
            "append": _AppendAction,
            "append_const": _AppendConstAction,
            "count": _CountAction,
        }
        if action_spec == "help":
            action_class = _StoreTrueAction
            kwargs.setdefault("default", False)
        elif isinstance(action_spec, str):
            action_class = constructors.get(action_spec)
            if action_class is None:
                raise ValueError("unknown action " + repr(action_spec))
        else:
            action_class = action_spec
        action = action_class(option_strings, dest, **kwargs)
        action._is_help = action_spec == "help"
        self._actions.append(action)
        if positional:
            self._positionals.append(action)
        for option in option_strings:
            self._option_string_actions[option] = action
        return action

    def _convert(self, action, value):
        try:
            converted = value if action.type is None else action.type(value)
        except (TypeError, ValueError, ArgumentTypeError) as error:
            self.error(str(error))
        if action.choices is not None and converted not in action.choices:
            self.error(
                "invalid choice: "
                + repr(converted)
                + " (choose from "
                + ", ".join(repr(choice) for choice in action.choices)
                + ")"
            )
        return converted

    def _defaults_namespace(self, namespace):
        namespace = Namespace() if namespace is None else namespace
        for action in self._actions:
            if not hasattr(namespace, action.dest):
                default = self._defaults.get(action.dest, action.default)
                if default is not SUPPRESS:
                    setattr(namespace, action.dest, default)
        return namespace

    def parse_known_args(self, args=None, namespace=None):
        args = list(sys.argv[1:] if args is None else args)
        namespace = self._defaults_namespace(namespace)
        unknown = []
        positionals = []
        index = 0
        while index < len(args):
            token = args[index]
            option = token
            attached = None
            if token.startswith("--") and "=" in token:
                option, attached = token.split("=", 1)
            action = self._option_string_actions.get(option)
            # Accept compact repetitions such as -qq and -vv.
            if action is None and token.startswith("-") and not token.startswith("--"):
                letters = token[1:]
                compact = self._option_string_actions.get("-" + letters[:1])
                if compact is not None and compact.nargs == 0:
                    if all(letter == letters[0] for letter in letters):
                        for _letter in letters:
                            compact(self, namespace, None, "-" + letters[0])
                        index += 1
                        continue
            if action is None:
                if token.startswith("-"):
                    unknown.append(token)
                else:
                    positionals.append(token)
                index += 1
                continue
            if getattr(action, "_is_help", False):
                self.print_help()
                self.exit()
            nargs = action.nargs
            if nargs == 0:
                action(self, namespace, None, option)
            elif nargs in ("*", "+"):
                values = []
                if attached is not None:
                    values.append(self._convert(action, attached))
                while index + 1 < len(args) and not args[index + 1].startswith("-"):
                    index += 1
                    values.append(self._convert(action, args[index]))
                if nargs == "+" and not values:
                    self.error(
                        "argument " + option + ": expected at least one argument"
                    )
                action(self, namespace, values, option)
            elif nargs == "?":
                if attached is not None:
                    value = self._convert(action, attached)
                elif index + 1 < len(args) and not args[index + 1].startswith("-"):
                    index += 1
                    value = self._convert(action, args[index])
                else:
                    value = action.const
                action(self, namespace, value, option)
            else:
                count = 1 if nargs is None else int(nargs)
                raw = []
                if attached is not None:
                    raw.append(attached)
                while len(raw) < count:
                    index += 1
                    if index >= len(args):
                        self.error("argument " + option + ": expected an argument")
                    raw.append(args[index])
                values = [self._convert(action, value) for value in raw]
                action(self, namespace, values[0] if count == 1 else values, option)
            index += 1
        if self._positionals:
            positional = self._positionals[0]
            if positional.nargs in ("*", "+"):
                setattr(namespace, positional.dest, positionals)
                if positional.nargs == "+" and not positionals:
                    self.error(
                        "the following arguments are required: " + positional.dest
                    )
            elif positionals:
                setattr(namespace, positional.dest, positionals[0])
                unknown.extend(positionals[1:])
        else:
            unknown.extend(positionals)
        return namespace, unknown

    def parse_args(self, args=None, namespace=None):
        result, unknown = self.parse_known_args(args, namespace)
        if unknown:
            self.error("unrecognized arguments: " + " ".join(unknown))
        return result

    def parse_known_intermixed_args(self, args=None, namespace=None):
        return self.parse_known_args(args, namespace)

    def parse_intermixed_args(self, args=None, namespace=None):
        return self.parse_args(args, namespace)

    def format_usage(self):
        usage = self.usage or ("%(prog)s [options]" % {"prog": self.prog})
        return "usage: " + usage + "\n"

    def format_help(self):
        lines = [self.format_usage().rstrip()]
        if self.description:
            lines.extend(["", self.description])
        for group in self._action_groups:
            if group.title:
                lines.extend(["", group.title + ":"])
            for action in group._actions:
                if action.help is SUPPRESS:
                    continue
                invocation = self.formatter_class(self.prog)._format_action_invocation(
                    action
                )
                lines.append(
                    "  " + invocation + ("  " + action.help if action.help else "")
                )
        return "\n".join(lines) + "\n"

    def print_help(self, file=None):
        print(self.format_help(), end="", file=sys.stdout if file is None else file)

    def error(self, message):
        raise SystemExit(self.format_usage() + self.prog + ": error: " + message)

    def exit(self, status=0, message=None):
        if message:
            print(message, end="", file=sys.stderr)
        raise SystemExit(status)
