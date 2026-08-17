module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
};
