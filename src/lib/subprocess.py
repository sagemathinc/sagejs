"""Python subprocess API backed by a cross-platform Node host capability.

The first backend executes eagerly and buffers output, while preserving the
public `Popen`/`run` contracts used by deterministic research scripts.
"""

import os
import io
import sagejs.runtime as runtime


PIPE = -1
STDOUT = -2
DEVNULL = -3


class SubprocessError(Exception):
    pass


class CalledProcessError(SubprocessError):
    def __init__(self, returncode, cmd, output=None, stderr=None):
        self.returncode = returncode
        self.cmd = cmd
        self.output = output
        self.stdout = output
        self.stderr = stderr

    def __str__(self):
        if self.returncode < 0:
            return (
                "Command "
                + repr(self.cmd)
                + " died with signal "
                + str(-self.returncode)
                + "."
            )
        return (
            "Command "
            + repr(self.cmd)
            + " returned non-zero exit status "
            + str(self.returncode)
            + "."
        )


class TimeoutExpired(SubprocessError):
    def __init__(self, cmd, timeout, output=None, stderr=None):
        self.cmd = cmd
        self.timeout = timeout
        self.output = output
        self.stdout = output
        self.stderr = stderr

    def __str__(self):
        return (
            "Command "
            + repr(self.cmd)
            + " timed out after "
            + str(self.timeout)
            + " seconds"
        )


class CompletedProcess:
    def __init__(self, args, returncode, stdout=None, stderr=None):
        self.args = args
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr

    def __repr__(self):
        return (
            "CompletedProcess(args="
            + repr(self.args)
            + ", returncode="
            + repr(self.returncode)
            + ("" if self.stdout is None else ", stdout=" + repr(self.stdout))
            + ("" if self.stderr is None else ", stderr=" + repr(self.stderr))
            + ")"
        )

    def check_returncode(self):
        if self.returncode:
            raise CalledProcessError(
                self.returncode, self.args, self.stdout, self.stderr
            )


def _command(args, shell):
    if isinstance(args, (str, bytes, os.PathLike)):
        text = os.fspath(args)
        if isinstance(text, bytes):
            text = text.decode()
        return [text] if not shell else [text]
    return [
        os.fspath(value) if isinstance(value, os.PathLike) else str(value)
        for value in args
    ]


def _environment(env):
    if env is None:
        return None
    return [[str(key), str(value)] for key, value in env.items()]


def _decode(data, text, encoding, errors):
    value = bytes(data)
    if not text:
        return value
    return value.decode(
        "utf8" if encoding is None else encoding,
        "strict" if errors is None else errors,
    )


class Popen:
    def __init__(
        self,
        args,
        bufsize=-1,
        executable=None,
        stdin=None,
        stdout=None,
        stderr=None,
        preexec_fn=None,
        close_fds=True,
        shell=False,
        cwd=None,
        env=None,
        universal_newlines=None,
        startupinfo=None,
        creationflags=0,
        restore_signals=True,
        start_new_session=False,
        pass_fds=(),
        *,
        user=None,
        group=None,
        extra_groups=None,
        encoding=None,
        errors=None,
        text=None,
        umask=-1,
        pipesize=-1,
        process_group=None,
        sagejs_input=None,
        sagejs_timeout=None,
        **keywords,
    ):
        del (
            bufsize,
            stdin,
            preexec_fn,
            close_fds,
            startupinfo,
            creationflags,
            restore_signals,
            start_new_session,
            pass_fds,
            user,
            group,
            extra_groups,
            umask,
            pipesize,
            process_group,
        )
        if keywords:
            raise TypeError("unexpected keyword argument: " + next(iter(keywords)))
        self.args = args
        self._stdout_setting = stdout
        self._stderr_setting = stderr
        self._text = bool(text or universal_newlines or encoding is not None)
        self._encoding = encoding
        self._errors = errors
        self.returncode = None
        self.pid = None
        self.stdout = None
        self.stderr = None
        self.stdin = None
        self._result = None
        self._run(
            shell,
            cwd,
            env,
            executable,
            sagejs_input,
            sagejs_timeout,
        )

    def _run(self, shell, cwd, env, executable, input_data, timeout):
        input_bytes = None
        if input_data is not None:
            if isinstance(input_data, str):
                input_bytes = input_data.encode(
                    "utf8" if self._encoding is None else self._encoding,
                    "strict" if self._errors is None else self._errors,
                )
            else:
                input_bytes = bytes(input_data)
        result = os._host_call(
            "subprocessRun",
            _command(self.args, shell),
            None if cwd is None else os.fspath(cwd),
            _environment(env),
            None if input_bytes is None else list(input_bytes),
            None if timeout is None else timeout * 1000,
            shell,
            executable,
            64 * 1024 * 1024,
        )
        error_code = os._property(result, "errorCode", None)
        raw_stdout = os._property(result, "stdout", [])
        raw_stderr = os._property(result, "stderr", [])
        stdout_value = _decode(raw_stdout, self._text, self._encoding, self._errors)
        stderr_value = _decode(raw_stderr, self._text, self._encoding, self._errors)
        if self._stderr_setting == STDOUT:
            stdout_value += stderr_value
            stderr_value = None
        self.pid = os._property(result, "pid", None)
        status = os._property(result, "status", None)
        signal = os._property(result, "signal", None)
        self.returncode = status if status is not None else (-1 if signal else 1)
        self._result = runtime.math_tuple(
            [
                stdout_value if self._stdout_setting == PIPE else None,
                stderr_value if self._stderr_setting == PIPE else None,
            ]
        )
        if self._stdout_setting == PIPE:
            self.stdout = (
                io.StringIO(stdout_value) if self._text else io.BytesIO(stdout_value)
            )
        if self._stderr_setting == PIPE:
            self.stderr = (
                io.StringIO(stderr_value) if self._text else io.BytesIO(stderr_value)
            )
        if error_code == "ETIMEDOUT":
            raise TimeoutExpired(self.args, timeout, stdout_value, stderr_value)
        if error_code in ("ENOENT", "EACCES"):
            message = os._property(result, "errorMessage", error_code)
            if error_code == "ENOENT":
                raise FileNotFoundError(2, message, _command(self.args, shell)[0])
            raise PermissionError(13, message, _command(self.args, shell)[0])

    def communicate(self, input=None, timeout=None):
        if input is not None:
            raise ValueError(
                "input must be supplied to subprocess.run in the eager backend"
            )
        del timeout
        return self._result

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        del timeout
        return self.returncode

    def send_signal(self, signal):
        del signal
        if self.returncode is None:
            raise NotImplementedError("live process signaling is not available")

    def terminate(self):
        self.send_signal(15)

    def kill(self):
        self.send_signal(9)

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.wait()
        return False


def run(
    args,
    *,
    stdin=None,
    input=None,
    stdout=None,
    stderr=None,
    capture_output=False,
    shell=False,
    cwd=None,
    timeout=None,
    check=False,
    encoding=None,
    errors=None,
    text=None,
    env=None,
    executable=None,
    universal_newlines=None,
    **keywords,
):
    if input is not None and stdin is not None:
        raise ValueError("stdin and input arguments may not both be used")
    if capture_output:
        if stdout is not None or stderr is not None:
            raise ValueError(
                "stdout and stderr arguments may not be used with capture_output"
            )
        stdout = PIPE
        stderr = PIPE
    stdout_setting = stdout
    stderr_setting = stderr
    process = Popen(
        args,
        -1,
        executable,
        stdin,
        stdout_setting,
        stderr_setting,
        None,
        True,
        shell,
        cwd,
        env,
        universal_newlines,
        None,
        0,
        True,
        False,
        (),
        encoding=encoding,
        errors=errors,
        text=text,
        sagejs_input=input,
        sagejs_timeout=timeout,
        **keywords,
    )
    output, error_output = process._result
    result = CompletedProcess(
        args,
        process.returncode,
        output if stdout_setting == PIPE or capture_output else None,
        error_output if stderr_setting == PIPE or capture_output else None,
    )
    if check:
        result.check_returncode()
    return result


def call(*popenargs, timeout=None, **keywords):
    return run(*popenargs, timeout=timeout, **keywords).returncode


def check_call(*popenargs, **keywords):
    return run(*popenargs, check=True, **keywords).returncode


def check_output(*popenargs, timeout=None, **keywords):
    if "stdout" in keywords:
        raise ValueError("stdout argument not allowed, it will be overridden")
    return run(
        *popenargs,
        stdout=PIPE,
        timeout=timeout,
        check=True,
        **keywords,
    ).stdout


def getstatusoutput(cmd, *, encoding=None, errors=None):
    result = run(
        cmd,
        shell=True,
        stdout=PIPE,
        stderr=STDOUT,
        text=True,
        encoding=encoding,
        errors=errors,
    )
    output = result.stdout[:-1] if result.stdout.endswith("\n") else result.stdout
    return result.returncode, output


def getoutput(cmd, *, encoding=None, errors=None):
    return getstatusoutput(cmd, encoding=encoding, errors=errors)[1]
