import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Public AWS identifiers are SAFE to ship in the binary; they're already public
// (anyone who signs in can see them in network traffic). API keys are NOT safe
// — but the user has opted to ship them anyway so end users have a zero-setup
// experience. See DEPLOYMENT.md for rotation/abuse guidance.
const BUILD_VAR_NAMES = [
  'AWS_REGION',
  'COGNITO_USER_POOL_ID',
  'COGNITO_APP_CLIENT_ID',
  'COGNITO_IDENTITY_POOL_ID',
  'DYNAMODB_TABLE',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_SUMMARY_MODEL',
  'OPENAI_VISION_MODEL',
  'DEEPGRAM_API_KEY',
] as const;

export default defineConfig(({ mode, command }) => {
  // electron-vite re-exports vite's loadEnv. Reads .env, .env.local, .env.<mode>,
  // .env.<mode>.local from project root. We want all keys, so pass '' as prefix.
  const env = loadEnv(mode, process.cwd(), '');
  const isBuild = command === 'build';

  const buildDefines: Record<string, string> = {};
  for (const name of BUILD_VAR_NAMES) {
    buildDefines[`__BUILD_${name}__`] = JSON.stringify(env[name] || '');
  }

  if (isBuild) {
    const missing = (['COGNITO_USER_POOL_ID', 'COGNITO_APP_CLIENT_ID', 'COGNITO_IDENTITY_POOL_ID'] as const)
      .filter((k) => !env[k]);
    if (missing.length) {
      throw new Error(
        `[meetly build] Refusing to build a release without baked AWS config.\n` +
        `Missing: ${missing.join(', ')}\n` +
        `Run \`terraform apply\` in /infra and copy outputs into .env.local.`
      );
    }
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: buildDefines,
      build: {
        outDir: 'dist-electron/main',
        lib: { entry: 'electron/main/index.ts' },
      },
      resolve: {
        alias: {
          '@shared': path.resolve(__dirname, 'shared'),
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        outDir: 'dist-electron/preload',
        lib: { entry: 'electron/preload/index.ts' },
      },
      resolve: {
        alias: {
          '@shared': path.resolve(__dirname, 'shared'),
        },
      },
    },
    renderer: {
      root: '.',
      plugins: [react()],
      build: {
        outDir: 'dist',
        rollupOptions: {
          input: {
            hub:      path.resolve(__dirname, 'hub.html'),
            overlay:  path.resolve(__dirname, 'overlay.html'),
            auth:     path.resolve(__dirname, 'auth.html'),
            library:  path.resolve(__dirname, 'library.html'),
            settings: path.resolve(__dirname, 'settings.html'),
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
          '@shared': path.resolve(__dirname, 'shared'),
        },
      },
      server: {
        port: 5173,
      },
    },
  };
});
