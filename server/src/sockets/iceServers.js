const env = require('../env');

function getIceServers() {
  const servers = [{ urls: env.stunUrl }];
  if (env.turnUrl) {
    servers.push({
      urls: env.turnUrl,
      username: env.turnUsername,
      credential: env.turnCredential,
    });
  }
  return servers;
}

module.exports = { getIceServers };
