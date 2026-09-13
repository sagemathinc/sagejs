"""Dictionary configuration for Sage.js's portable `logging` package.

The implementation follows the standard version-1 dictionary schema for the
portable handler, formatter, filter, logger, and root configuration used by
Python libraries. Network listener and INI-file configuration APIs are not
available in the browser runtime.
"""

import importlib

import logging


def _resolve(name):
    pieces = name.split(".")
    module = None
    boundary = 0
    for index in range(len(pieces), 0, -1):
        try:
            module = importlib.import_module(".".join(pieces[:index]))
            boundary = index
            break
        except ImportError:
            pass
    if module is None:
        raise ImportError(name)
    value = module
    for piece in pieces[boundary:]:
        value = getattr(value, piece)
    return value


def _convert(value, config):
    if isinstance(value, str):
        if value.startswith("ext://"):
            return _resolve(value[6:])
        if value.startswith("cfg://"):
            current = config
            for piece in value[6:].split("."):
                current = current[piece]
            return current
        return value
    if isinstance(value, list):
        return [_convert(item, config) for item in value]
    if isinstance(value, tuple):
        return tuple(_convert(item, config) for item in value)
    if isinstance(value, dict):
        return {key: _convert(item, config) for key, item in value.items()}
    return value


def _construct_factory(specification, default_factory, config, reserved):
    settings = dict(specification)
    factory = settings.pop("()", None)
    if factory is None:
        factory = settings.pop("class", default_factory)
    if isinstance(factory, str):
        factory = _resolve(factory)
    for key in reserved:
        settings.pop(key, None)
    settings = {key: _convert(value, config) for key, value in settings.items()}
    return factory(**settings)


def _configure_filters(config):
    filters = {}
    for name, specification in config.get("filters", {}).items():
        filters[name] = _construct_factory(
            specification,
            logging.Filter,
            config,
            (),
        )
    return filters


def _configure_formatters(config):
    formatters = {}
    for name, specification in config.get("formatters", {}).items():
        settings = dict(specification)
        if "format" in settings:
            settings["fmt"] = settings.pop("format")
        formatters[name] = _construct_factory(
            settings,
            logging.Formatter,
            config,
            (),
        )
    return formatters


def _configure_handlers(config, formatters, filters):
    handlers = {}
    for name, specification in config.get("handlers", {}).items():
        handler = _construct_factory(
            specification,
            logging.StreamHandler,
            config,
            ("level", "formatter", "filters"),
        )
        if specification.get("level") is not None:
            handler.setLevel(specification["level"])
        formatter_name = specification.get("formatter")
        if formatter_name is not None:
            handler.setFormatter(formatters[formatter_name])
        for filter_name in specification.get("filters", ()):
            handler.addFilter(filters[filter_name])
        handler.set_name(name)
        handlers[name] = handler
    return handlers


def _configure_logger(logger, specification, handlers, filters):
    if specification.get("level") is not None:
        logger.setLevel(specification["level"])
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    for handler_name in specification.get("handlers", ()):
        logger.addHandler(handlers[handler_name])
    for filter_ in list(logger.filters):
        logger.removeFilter(filter_)
    for filter_name in specification.get("filters", ()):
        logger.addFilter(filters[filter_name])
    if "propagate" in specification:
        logger.propagate = specification["propagate"]
    logger.disabled = False


def dictConfig(config):
    """Configure logging from a standard version-1 dictionary."""
    if not isinstance(config, dict):
        raise TypeError("logging configuration must be a dictionary")
    if config.get("version") != 1:
        raise ValueError("Unsupported logging configuration version")

    if config.get("incremental", False):
        for name, specification in config.get("loggers", {}).items():
            logger = logging.getLogger(name)
            if specification.get("level") is not None:
                logger.setLevel(specification["level"])
            if "propagate" in specification:
                logger.propagate = specification["propagate"]
        root_specification = config.get("root")
        if root_specification and root_specification.get("level") is not None:
            logging.root.setLevel(root_specification["level"])
        return

    filters = _configure_filters(config)
    formatters = _configure_formatters(config)
    handlers = _configure_handlers(config, formatters, filters)
    configured_names = set(config.get("loggers", {}))

    if config.get("disable_existing_loggers", True):
        for name, logger in logging.manager.loggerDict.items():
            if name not in configured_names:
                logger.disabled = True

    for name, specification in config.get("loggers", {}).items():
        _configure_logger(logging.getLogger(name), specification, handlers, filters)

    if "root" in config:
        _configure_logger(logging.root, config["root"], handlers, filters)


def fileConfig(*args, **kwargs):
    raise NotImplementedError(
        "logging.config.fileConfig is unavailable in the portable Sage.js runtime; "
        "use dictConfig"
    )


def listen(*args, **kwargs):
    raise NotImplementedError("logging configuration listeners require a socket server")


def stopListening():
    return None


__all__ = ["dictConfig", "fileConfig", "listen", "stopListening"]
