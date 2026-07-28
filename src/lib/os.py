"""Portable operating-system interfaces backed by Node.js."""

import sagejs.runtime as runtime


sep = '/'
pathsep = ':'
linesep = '\n'
name = 'posix'


def _node_os_call(method):
    node_os = runtime.require_module('os')
    function = runtime.reflect.get(node_os, method)
    return runtime.reflect.apply(function, node_os, [])


def uname():
    """Return host identification using Python's five-field tuple contract."""
    values = [
        _node_os_call('type'),
        _node_os_call('hostname'),
        _node_os_call('release'),
        _node_os_call('version'),
        _node_os_call('machine'),
    ]
    fields = ['sysname', 'nodename', 'release', 'version', 'machine']
    return runtime.named_tuple(values, 'posix.uname_result', fields)
