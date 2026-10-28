import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],root:'apps/admin_web',build:{outDir:'../../dist/web',emptyOutDir:true,rollupOptions:{input:{main:'apps/admin_web/index.html',admin:'apps/admin_web/admin.html'}}},server:{proxy:{'/api':'http://127.0.0.1:3100'}}});
