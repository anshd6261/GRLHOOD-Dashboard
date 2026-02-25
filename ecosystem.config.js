module.exports = {
    apps: [
        {
            name: "fulfillment-api",
            script: "src/server.js",
            watch: false,
            env: {
                NODE_ENV: "production",
            },
            max_memory_restart: '1G', // Restart if memory exceeds 1GB
            exp_backoff_restart_delay: 100 // Progressive restart delay if crashing
        },
        {
            name: "prevent-sleep",
            script: "caffeinate",
            args: "-i", // Prevent system idle sleep
            interpreter: "none",
            autorestart: true
        },
        {
            name: "localtunnel",
            script: "npx",
            args: "localtunnel --port 3001 --subdomain grlhood-dash-api",
            interpreter: "none",
            restart_delay: 5000
        }
    ]
};
