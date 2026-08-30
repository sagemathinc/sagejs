"""Sage.js backend for the upstream `comm` package.

The backend has no knowledge of Jupyter or browser transports. It publishes
versioned host events and receives normalized events through a session-local
dispatcher installed by :func:`install`.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _host_function(name: str) -> Any:
    function = runtime.reflect.get(runtime.global_object, name)
    if not runtime.strict_equal(runtime.jstype(function), "function"):
        raise RuntimeError(
            "comm transport requires a Sage.js interactive evaluator; "
            + name
            + " is unavailable"
        )
    return function


def _event_value(event: Any, name: str, default: Any = None) -> Any:
    value = runtime.reflect.get(event, name)
    return default if value is runtime.undefined else value


def _python_json(value: Any) -> Any:
    """Materialize validated host JSON as ordinary Python containers."""
    if value is None or runtime.strict_equal(runtime.jstype(value), "string"):
        return value
    if runtime.strict_equal(runtime.jstype(value), "number") or runtime.strict_equal(
        runtime.jstype(value), "boolean"
    ):
        return value
    if runtime.array.isArray(value):
        return [_python_json(item) for item in value]
    answer = {}
    for key in runtime.object.keys(value):
        answer[str(key)] = _python_json(runtime.reflect.get(value, key))
    return answer


_manager: Any = None
_installed = False


def _manager_instance() -> Any:
    global _manager  # noqa: PLW0603
    if _manager is None:
        from comm.base_comm import CommManager

        _manager = CommManager()
    return _manager


class SageComm:
    """Factory marker replaced with the concrete subclass during installation."""


def _sage_comm_class() -> Any:
    from comm.base_comm import BaseComm

    class _SageComm(BaseComm):
        def publish_msg(
            self,
            msg_type: str,
            data: dict[str, Any] | None = None,
            metadata: dict[str, Any] | None = None,
            buffers: list[bytes] | None = None,
            **keys: Any,
        ) -> None:
            event_type = {
                "comm_open": "open",
                "comm_msg": "message",
                "comm_close": "close",
            }.get(msg_type)
            if event_type is None:
                raise ValueError("unknown comm message type: " + msg_type)
            runtime.reflect.apply(
                _host_function("__sagejs_comm_publish__"),
                runtime.undefined,
                [
                    event_type,
                    self.comm_id,
                    keys.get("target_name", self.target_name),
                    keys.get("target_module", self.target_module),
                    {} if data is None else data,
                    {} if metadata is None else metadata,
                    [] if buffers is None else buffers,
                ],
            )

    _SageComm.__name__ = "SageComm"
    return _SageComm


def _message(event: Any) -> dict[str, Any]:
    event_type = _event_value(event, "type")
    content = {
        "comm_id": _event_value(event, "commId"),
        "data": _python_json(_event_value(event, "data", {})),
    }
    if event_type == "open":
        content["target_name"] = _event_value(event, "targetName")
        target_module = _event_value(event, "targetModule")
        if target_module is not None:
            content["target_module"] = target_module
    return {
        "header": {},
        "parent_header": {},
        "metadata": _python_json(_event_value(event, "metadata", {})),
        "content": content,
        "buffers": _event_value(event, "buffers", []),
    }


def _dispatch(event: Any) -> None:
    event_type = _event_value(event, "type")
    manager = _manager_instance()
    message = _message(event)
    if event_type == "open":
        manager.comm_open(None, "", message)
    elif event_type == "message":
        manager.comm_msg(None, "", message)
    elif event_type == "close":
        manager.comm_close(None, "", message)
    else:
        raise ValueError("unknown comm event type: " + str(event_type))


def _comm_info(target_name: str | None = None) -> dict[str, dict[str, str]]:
    answer = {}
    for comm_id, active_comm in _manager_instance().comms.items():
        if target_name is None or active_comm.target_name == target_name:
            answer[comm_id] = {"targetName": active_comm.target_name}
    return answer


def close_all() -> None:
    """Close and unregister every live comm in deterministic id order."""
    manager = _manager_instance()
    for comm_id in sorted(list(manager.comms)):
        active_comm = manager.comms.get(comm_id)
        if active_comm is not None:
            active_comm.close()


def install() -> None:
    """Install this backend into upstream `comm` for the current session."""
    global _installed  # noqa: PLW0603
    if _installed:
        return
    import comm

    comm.create_comm = _sage_comm_class()
    comm.get_comm_manager = _manager_instance
    runtime.reflect.set(
        runtime.global_object, "__sagejs_comm_dispatch_python__", _dispatch
    )
    runtime.reflect.set(
        runtime.global_object, "__sagejs_comm_info_python__", _comm_info
    )
    runtime.reflect.set(
        runtime.global_object, "__sagejs_comm_close_all_python__", close_all
    )
    _installed = True


__all__ = ["close_all", "install"]
