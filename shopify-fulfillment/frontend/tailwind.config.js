/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                dark: {
                    900: '#0f172a', // Slate 900
                    800: '#1e293b', // Slate 800
                    700: '#334155', // Slate 700
                },
                primary: {
                    500: '#8b5cf6', // Violet 500
                    600: '#7c3aed', // Violet 600
                }
            },
            animation: {
                'spin-slow': 'spin 3s linear infinite',
            }
        },
    },
    plugins: [],
}
