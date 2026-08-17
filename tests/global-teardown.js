module.exports = async function globalTeardown() {
  const pid = process.env.SERVER_CHILD_PID;
  if (pid) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch (e) {}
  }
};
