/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Tests must not depend on a developer's .env.local (demo mode, default limits).
    env: { VITE_API_URL: '', VITE_MAX_CV_MB: '', VITE_PRIVACY_POLICY_URL: '' },
  },
})
