module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // pnpm's `.pnpm/NAME/node_modules/NAME` layout defeats the preset's npm/yarn
  // negative lookahead. Transform loaded dependencies so RN's ESM/Flow setup
  // is compiled in this standalone pnpm package.
  transformIgnorePatterns: [],
};
