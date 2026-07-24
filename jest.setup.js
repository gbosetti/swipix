/* eslint-env jest */
// Swaps the real native AsyncStorage module for its official mock during
// tests — the mock file itself only exports the mock object, it doesn't
// register itself, so this jest.mock() call is what actually makes
// `import AsyncStorage from '@react-native-async-storage/async-storage'`
// resolve to something usable outside of a real native runtime.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Required for @testing-library/react-native (React 19 + the `test-renderer`
// package) to treat state updates that happen during a test — even ones
// triggered from an async callback after render() returns, like a resolved
// AsyncStorage promise — as expected and act()-wrapped, instead of warning
// about updates outside a React act() environment. See
// https://github.com/reactwg/react-18/discussions/102.
global.IS_REACT_ACT_ENVIRONMENT = true;
