import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { buildRendererCsp } from './src/shared/content-security-policy'

/** Injects the renderer's Content-Security-Policy, relaxed only for the dev server. */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'golti-content-security-policy',
    transformIndexHtml(_html, ctx) {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildRendererCsp({ dev: Boolean(ctx.server) }) },
          injectTo: 'head-prepend'
        }
      ]
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), contentSecurityPolicy()]
  }
})
