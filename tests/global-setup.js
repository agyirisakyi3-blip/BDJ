const { fork } = require('child_process');
const path = require('path');

const PORT = 3456;

module.exports = async function globalSetup() {
  const serverScript = path.resolve(__dirname, 'server.js');
  const child = fork(serverScript, [], { stdio: 'pipe' });
  process.env.APP_URL = `http://localhost:${PORT}`;
  process.env.SERVER_CHILD_PID = String(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 1500));
};
