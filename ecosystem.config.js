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
            name: "cf-tunnel",
            script: "./cloudflared",
            args: "tunnel --url http://localhost:3001",
            interpreter: "none", // Binary, not node script
            restart_delay: 5000 // Wait 5s before restart if it crashes
        }
    ]
};
