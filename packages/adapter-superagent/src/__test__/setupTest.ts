// Setup file for Node.js test runner - mocks superagent
import { mockSuperagent } from "./__mocks__/superagentMock";

// Mock superagent module before any imports
// This needs to be done via dynamic import or by modifying the adapter to accept superagent instance
// For now, we'll use a different approach - create a test adapter that uses the mock

export { mockSuperagent };

