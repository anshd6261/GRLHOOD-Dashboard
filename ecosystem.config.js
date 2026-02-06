module.exports = {
    apps: [
        {
            name: "fulfillment-api",
            script: "src/server.js",
            watch: false,
            env: {
                NODE_ENV: "production",
            }
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
