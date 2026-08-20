/* global jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(key => Promise.resolve(values.get(key) ?? null)),
      setItem: jest.fn((key, value) => {
        values.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn(key => {
        values.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        values.clear();
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('@dr.pogodin/react-native-fs', () => ({
  MainBundlePath: '/app/SageJSMobile.app',
  TemporaryDirectoryPath: '/tmp',
  readFile: jest.fn(),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-documents/picker', () => ({
  types: { json: 'application/json', plainText: 'text/plain' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: value => Boolean(value && typeof value.code === 'string'),
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  saveDocuments: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      postMessage: jest.fn(),
      reload: jest.fn(),
    }));
    return React.createElement(View, {
      ...props,
      testID: props.testID ?? 'mock-webview',
    });
  });
});
