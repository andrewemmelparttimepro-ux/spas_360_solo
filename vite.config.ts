import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // The package root also exports the unrelated full conversational/livekit
      // stack. SPAS 360 only uses realtime transcription; pinning the locked
      // scribe entry keeps ~1 MB of source out of the signed-in shell.
      { find: '@elevenlabs/react', replacement: path.resolve(__dirname, './node_modules/@elevenlabs/react/dist/scribe.js') },
      { find: '@elevenlabs/client', replacement: path.resolve(__dirname, './src/vendor/elevenlabsScribe.ts') },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Big vendors get their own long-cached chunks; recharts only loads
        // with the pages that actually chart (all routes are lazy).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dnd': ['@hello-pangea/dnd'],
          'vendor-voice-scribe': ['@elevenlabs/react'],
        },
      },
    },
  },
});
