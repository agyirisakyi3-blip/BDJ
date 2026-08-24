const { fork } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3456;

function ping() {
  return new Promise(resolve => {
    const req = http.get({ host: 'localhost', port: PORT, path: '/index.html', timeout: 800 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

module.exports = async function globalSetup() {
  const serverScript = path.resolve(__dirname, 'server.js');
  const child = fork(serverScript, [], { stdio: 'ignore' });
  process.env.SERVER_CHILD_PID = String(child.pid);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await ping()) return;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Test server did not start on port ' + PORT);
};
