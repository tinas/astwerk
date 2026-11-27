import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    platform: 'neutral',
    dts: {
      generator: 'tsgo',
    },
    exports: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
    },
  },
})
