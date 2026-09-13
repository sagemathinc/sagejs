import logging
import logging.config


class MemoryHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(self.format(record))


logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"short": {"format": "%(levelname)s:%(message)s"}},
        "handlers": {
            "memory": {
                "()": MemoryHandler,
                "level": "INFO",
                "formatter": "short",
            }
        },
        "loggers": {
            "probe": {
                "level": "DEBUG",
                "handlers": ["memory"],
                "propagate": False,
            }
        },
    }
)

logger = logging.getLogger("probe")
logger.debug("hidden")
logger.info("visible")
assert len(logger.handlers) == 1
assert logger.handlers[0].messages == ["INFO:visible"]
