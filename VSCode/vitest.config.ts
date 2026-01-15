import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'out', '.vscode-test'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.test.ts',
        'out/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    
    // Global test timeout
    testTimeout: 10000,
    
    // Globals (optional, allows using describe/it without imports)
    globals: true,
    
    // Setup files
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

