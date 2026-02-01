const os = require('os');

/**
 * Colyseus Cloud Deployment Configuration.
 * This file is at the root but points to the server subdirectory.
 * See documentation: https://docs.colyseus.io/deployment/cloud
 */

module.exports = {
  apps : [{
    name: "starstrafe-server",
    script: 'server/build/index.js',
    cwd: './',
    time: true,
    watch: false,
    instances: os.cpus().length,
    exec_mode: 'fork',
    wait_ready: true,
  }],
};
