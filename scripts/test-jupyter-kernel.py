#!/usr/bin/env python3
"""End-to-end Jupyter wire-protocol tests for the Sage.js kernel."""

from __future__ import annotations

import queue
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from jupyter_client import BlockingKernelClient
from jupyter_client.connect import write_connection_file


ROOT = Path(__file__).resolve().parent.parent


def matching_message(
    client: BlockingKernelClient,
    channel: str,
    msg_id: str,
    timeout: float = 20,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    getter = getattr(client, f"get_{channel}_msg")
    while time.monotonic() < deadline:
        try:
            message = getter(timeout=max(0.1, deadline - time.monotonic()))
        except queue.Empty:
            continue
        if message["parent_header"].get("msg_id") == msg_id:
            return message
    raise TimeoutError(f"no {channel} reply for {msg_id}")


def iopub_until_idle(
    client: BlockingKernelClient,
    msg_id: str,
    timeout: float = 30,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            message = client.get_iopub_msg(
                timeout=max(0.1, deadline - time.monotonic())
            )
        except queue.Empty:
            continue
        if message["parent_header"].get("msg_id") != msg_id:
            continue
        messages.append(message)
        if (
            message["header"]["msg_type"] == "status"
            and message["content"]["execution_state"] == "idle"
        ):
            return messages
    raise TimeoutError(f"execution {msg_id} did not become idle")


def message_of_type(
    messages: list[dict[str, Any]], msg_type: str
) -> dict[str, Any]:
    return next(
        message
        for message in messages
        if message["header"]["msg_type"] == msg_type
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sagejs-jupyter-test-") as directory:
        connection_file, _ = write_connection_file(
            str(Path(directory) / "kernel.json"),
            ip="127.0.0.1",
            key=b"sagejs-test-key",
        )
        process = subprocess.Popen(
            [
                "node",
                str(ROOT / "bin" / "sagejs-jupyter"),
                "--connection-file",
                connection_file,
            ],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        client = BlockingKernelClient(connection_file=connection_file)
        client.load_connection_file()
        client.start_channels()
        try:
            client.wait_for_ready(timeout=30)

            info_id = client.kernel_info()
            info = matching_message(client, "shell", info_id)["content"]
            assert info["status"] == "ok"
            assert info["implementation"] == "sagejs"
            assert info["language_info"]["name"] == "sage"

            execute_id = client.execute(
                "value = 12\nprint('value:', value)\nfactor(value)"
            )
            messages = iopub_until_idle(client, execute_id)
            reply = matching_message(client, "shell", execute_id)["content"]
            assert reply["status"] == "ok"
            assert message_of_type(messages, "stream")["content"]["text"] == (
                "value: 12\n"
            )
            assert (
                message_of_type(messages, "execute_result")["content"]["data"][
                    "text/plain"
                ]
                == "2^2 * 3"
            )

            persistent_id = client.execute("value^2")
            messages = iopub_until_idle(client, persistent_id)
            assert (
                message_of_type(messages, "execute_result")["content"]["data"][
                    "text/plain"
                ]
                == "144"
            )
            assert matching_message(client, "shell", persistent_id)["content"][
                "status"
            ] == "ok"

            polynomial_id = client.execute("R.<x> = QQ[]")
            iopub_until_idle(client, polynomial_id)
            assert matching_message(client, "shell", polynomial_id)["content"][
                "status"
            ] == "ok"

            plot_id = client.execute("plot(sin(x), (x, 0, 4*pi))")
            messages = iopub_until_idle(client, plot_id)
            plot_data = message_of_type(messages, "execute_result")["content"][
                "data"
            ]
            assert "text/plain" in plot_data
            assert "application/vnd.plotly.v1+json" in plot_data
            assert "text/html" in plot_data
            assert "https://cdn.plot.ly/plotly-3.7.0.min.js" in (
                plot_data["text/html"]
            )
            assert "Plotly.newPlot" in plot_data["text/html"]
            assert matching_message(client, "shell", plot_id)["content"][
                "status"
            ] == "ok"

            complete_id = client.complete("prime_p", 7)
            completion = matching_message(client, "shell", complete_id)["content"]
            assert completion["status"] == "ok"
            assert "prime_pi" in completion["matches"]
            assert completion["cursor_start"] == 0
            assert completion["cursor_end"] == 7

            attribute_id = client.complete("QQ['x'].g", 9)
            attribute = matching_message(client, "shell", attribute_id)["content"]
            assert attribute["status"] == "ok"
            assert "gen" in attribute["matches"]
            assert attribute["cursor_start"] == 8
            assert attribute["cursor_end"] == 9

            inspect_id = client.inspect("prime_pi", 8)
            inspection = matching_message(client, "shell", inspect_id)["content"]
            assert inspection["status"] == "ok"
            assert inspection["found"]
            assert "prime_pi" in inspection["data"]["text/plain"]

            completeness_id = client.is_complete("for n in range(3):")
            completeness = matching_message(
                client, "shell", completeness_id
            )["content"]
            assert completeness == {"status": "incomplete", "indent": "    "}

            error_id = client.execute("1/0")
            messages = iopub_until_idle(client, error_id)
            error = message_of_type(messages, "error")["content"]
            assert error["ename"] == "ZeroDivisionError"
            assert matching_message(client, "shell", error_id)["content"][
                "status"
            ] == "error"

            interrupt_id = client.execute("while True:\n    pass")
            while True:
                message = client.get_iopub_msg(timeout=20)
                if (
                    message["parent_header"].get("msg_id") == interrupt_id
                    and message["header"]["msg_type"] == "execute_input"
                ):
                    break
            interrupt_request = client.session.send(
                client.control_channel.socket,
                "interrupt_request",
                content={},
            )
            assert interrupt_request is not None
            interrupt_request_id = interrupt_request["header"]["msg_id"]
            interrupted_messages = iopub_until_idle(client, interrupt_id)
            interrupted = message_of_type(interrupted_messages, "error")[
                "content"
            ]
            assert interrupted["ename"] == "KeyboardInterrupt"
            assert matching_message(client, "shell", interrupt_id)["content"][
                "status"
            ] == "error"
            assert matching_message(
                client, "control", interrupt_request_id
            )["content"] == {"status": "ok"}

            recovered_id = client.execute("factor(30)")
            recovered_messages = iopub_until_idle(client, recovered_id)
            assert (
                message_of_type(recovered_messages, "execute_result")["content"][
                    "data"
                ]["text/plain"]
                == "2 * 3 * 5"
            )
            assert matching_message(client, "shell", recovered_id)["content"][
                "status"
            ] == "ok"

            preserved_id = client.execute("value")
            preserved_messages = iopub_until_idle(client, preserved_id)
            assert (
                message_of_type(preserved_messages, "execute_result")["content"][
                    "data"
                ]["text/plain"]
                == "12"
            )
            assert matching_message(client, "shell", preserved_id)["content"][
                "status"
            ] == "ok"

            shutdown_id = client.shutdown(restart=False)
            shutdown = matching_message(
                client, "control", shutdown_id
            )["content"]
            assert shutdown == {"status": "ok", "restart": False}
            process.wait(timeout=10)
            assert process.returncode == 0
        finally:
            client.stop_channels()
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            stdout = process.stdout.read() if process.stdout else ""
            stderr = process.stderr.read() if process.stderr else ""
            if process.returncode not in (0, -signal.SIGTERM):
                raise AssertionError(
                    f"kernel exited {process.returncode}\n"
                    f"stdout:\n{stdout}\nstderr:\n{stderr}"
                )

    print("Jupyter kernel tests passed")


if __name__ == "__main__":
    main()
