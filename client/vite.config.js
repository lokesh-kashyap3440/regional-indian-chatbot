import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Change configuration to a function to access 'mode'
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars (not just VITE_ ones), 
  // ensuring you get everything you need.
  const env = loadEnv(mode, process.cwd(), '');
  console.log("URL"+env.VITE_BACKEND_URL)

  return {
    plugins: [react()],
    server: {
      host: true, // Exposes app to network (Required for Cloudflare Tunnel)
      port: 5173,
      // CRITICAL: Add your Cloudflare domain here to prevent "Invalid Host header" errors
      allowedHosts: [
        'regional-chatbot.lokmridansh.xyz',
        '.lokmridansh.xyz' // Optional: Allows all subdomains
      ],
      proxy: {
        '/chat': {
          // Use 'env' variable instead of process.env
          target: env.VITE_BACKEND_URL || 'http://192.168.1.12:3000',
          changeOrigin: true,
          secure: false,
        },
        '/upload': {
          target: env.VITE_BACKEND_URL || 'http://192.168.1.12:3000',
          changeOrigin: true,
          secure: false,
        },
        '/files': {
          target: env.VITE_BACKEND_URL || 'http://192.168.1.12:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});