// Setup file for Node.js test runner - mocks axios
import { mockAxios } from "./__mocks__/axiosMock";

// Mock axios module before any imports
// This needs to be done via dynamic import or by modifying the adapter to accept axios instance
// For now, we'll use a different approach - create a test adapter that uses the mock

export { mockAxios };

