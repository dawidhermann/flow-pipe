// Setup file for Node.js test runner - mocks node-fetch
import { mockNodeFetch } from "./__mocks__/node-fetch-mock";

// Mock node-fetch module before any imports
// This needs to be done via dynamic import or by modifying the adapter to accept fetch instance
// For now, we'll use a different approach - create a test adapter that uses the mock

export { mockNodeFetch };
