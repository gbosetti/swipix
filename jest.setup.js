/* eslint-env jest */
// Swaps the real native AsyncStorage module for its official mock during
// tests — the mock file itself only exports the mock object, it doesn't
// register itself, so this jest.mock() call is what actually makes
// `import AsyncStorage from '@react-native-async-storage/async-storage'`
// resolve to something usable outside of a real native runtime.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
