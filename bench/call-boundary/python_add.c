#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <stdint.h>

static PyObject *add_fastcall(
    PyObject *self,
    PyObject *const *arguments,
    Py_ssize_t argument_count
) {
    long left;
    long right;
    (void)self;
    if (argument_count != 2) {
        PyErr_SetString(PyExc_TypeError, "add_fastcall requires exactly two integers");
        return NULL;
    }
    left = PyLong_AsLong(arguments[0]);
    if (left == -1 && PyErr_Occurred()) return NULL;
    right = PyLong_AsLong(arguments[1]);
    if (right == -1 && PyErr_Occurred()) return NULL;
    return PyLong_FromLong((int32_t)((uint32_t)(int32_t)left + (uint32_t)(int32_t)right));
}

static PyObject *add_varargs(PyObject *self, PyObject *arguments) {
    int left;
    int right;
    (void)self;
    if (!PyArg_ParseTuple(arguments, "ii:add_varargs", &left, &right)) return NULL;
    return PyLong_FromLong((int32_t)((uint32_t)left + (uint32_t)right));
}

static PyMethodDef methods[] = {
    {
        "add_fastcall",
        (PyCFunction)(void (*)(void))add_fastcall,
        METH_FASTCALL,
        "Add two int32 values through CPython's vectorcall-compatible C ABI.",
    },
    {
        "add_varargs",
        add_varargs,
        METH_VARARGS,
        "Add two int32 values through the legacy tuple-forming C ABI.",
    },
    {NULL, NULL, 0, NULL},
};

static struct PyModuleDef module = {
    PyModuleDef_HEAD_INIT,
    "boundary_add",
    "Minimal CPython extension-call boundary benchmark.",
    -1,
    methods,
};

PyMODINIT_FUNC PyInit_boundary_add(void) {
    return PyModule_Create(&module);
}
