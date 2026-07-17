import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios';
import '@fontsource-variable/inter';
import './index.css'
import './theme.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'

axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';

// Apply persisted theme before first paint (default: dark)
document.documentElement.setAttribute('data-theme', localStorage.getItem('grlhood_theme') || 'light');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
