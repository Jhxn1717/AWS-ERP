import { defineConfig,loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({plugins:[react()],server:{headers:{'Referrer-Policy':'no-referrer-when-downgrade','Cross-Origin-Opener-Policy':'same-origin-allow-popups'},proxy:{'/api':loadEnv(mode,'.','ERP_').ERP_API_URL||'http://127.0.0.1:8000'}},build:{rollupOptions:{output:{manualChunks:{charts:['recharts']}}}}}));
