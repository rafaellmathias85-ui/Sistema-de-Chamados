module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    cwd: '/var/www/helpdesk/app',
    interpreter: 'node',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_restarts: 3,
    min_uptime: '15s',
    restart_delay: 5000,
    kill_timeout: 30000,
    listen_timeout: 30000,
    node_args: '--max-old-space-size=1024',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      PUPPETEER_EXECUTABLE_PATH: '/home/ubuntu/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'
    }
  }]
};
