export default {
  apps: [{
    name:          'topboeken-api',
    script:        './server/index.js',
    env_file:      '.env',
    watch:         false,
    restart_delay: 3000,
    max_restarts:  5,
  }],
};
