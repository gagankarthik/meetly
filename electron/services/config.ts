// Single source of truth for app configuration.
//
// At build time, electron-vite's `define` replaces the __BUILD_* constants with
// literal strings read from .env.local. In dev (`npm run dev`) the defines
// resolve to empty strings, and we fall back to process.env (loaded from
// .env.local by dotenv in main/index.ts). In a packaged build the baked values
// always win, so the .exe is self-contained and end users never touch env vars.
//
// Adding a new build-time value: declare it here, add it to the `define` block
// in electron.vite.config.ts, and reference it via `config.X` instead of
// process.env.X anywhere in the main process.

import { app } from 'electron';

declare const __BUILD_AWS_REGION__: string;
declare const __BUILD_COGNITO_USER_POOL_ID__: string;
declare const __BUILD_COGNITO_APP_CLIENT_ID__: string;
declare const __BUILD_COGNITO_IDENTITY_POOL_ID__: string;
declare const __BUILD_DYNAMODB_TABLE__: string;
declare const __BUILD_OPENAI_API_KEY__: string;
declare const __BUILD_OPENAI_MODEL__: string;
declare const __BUILD_OPENAI_SUMMARY_MODEL__: string;
declare const __BUILD_OPENAI_VISION_MODEL__: string;
declare const __BUILD_DEEPGRAM_API_KEY__: string;

function baked(name: string): string {
  // The __BUILD_*__ symbols are replaced by vite as bare identifiers. If the
  // replacement didn't happen (dev mode), referencing them throws ReferenceError;
  // catch and treat as empty.
  try {
    switch (name) {
      case 'AWS_REGION':                return __BUILD_AWS_REGION__;
      case 'COGNITO_USER_POOL_ID':      return __BUILD_COGNITO_USER_POOL_ID__;
      case 'COGNITO_APP_CLIENT_ID':     return __BUILD_COGNITO_APP_CLIENT_ID__;
      case 'COGNITO_IDENTITY_POOL_ID':  return __BUILD_COGNITO_IDENTITY_POOL_ID__;
      case 'DYNAMODB_TABLE':            return __BUILD_DYNAMODB_TABLE__;
      case 'OPENAI_API_KEY':            return __BUILD_OPENAI_API_KEY__;
      case 'OPENAI_MODEL':              return __BUILD_OPENAI_MODEL__;
      case 'OPENAI_SUMMARY_MODEL':      return __BUILD_OPENAI_SUMMARY_MODEL__;
      case 'OPENAI_VISION_MODEL':       return __BUILD_OPENAI_VISION_MODEL__;
      case 'DEEPGRAM_API_KEY':          return __BUILD_DEEPGRAM_API_KEY__;
      default:                          return '';
    }
  } catch {
    return '';
  }
}

function resolve(name: string, fallback = ''): string {
  return baked(name) || process.env[name] || fallback;
}

export const config = {
  get awsRegion()              { return resolve('AWS_REGION', 'us-east-1'); },
  get cognitoUserPoolId()      { return resolve('COGNITO_USER_POOL_ID'); },
  get cognitoAppClientId()     { return resolve('COGNITO_APP_CLIENT_ID'); },
  get cognitoIdentityPoolId()  { return resolve('COGNITO_IDENTITY_POOL_ID'); },
  get dynamoTable()            { return resolve('DYNAMODB_TABLE', 'Meetly'); },

  get openaiApiKey()           { return resolve('OPENAI_API_KEY'); },
  get openaiAskModel()         { return resolve('OPENAI_MODEL',         'gpt-4.1-mini'); },
  get openaiSummaryModel()     { return resolve('OPENAI_SUMMARY_MODEL', 'gpt-4.1-mini'); },
  get openaiVisionModel()      { return resolve('OPENAI_VISION_MODEL',  'gpt-4.1-mini'); },

  get deepgramApiKey()         { return resolve('DEEPGRAM_API_KEY'); },

  // DEV_SKIP_AUTH is honored only in dev — packaged builds can never enable it,
  // even if someone tampers with the user's environment.
  get devSkipAuth() {
    if (app.isPackaged) return false;
    return process.env.DEV_SKIP_AUTH === 'true';
  },
};

/**
 * Throws if a packaged build is missing required AWS config. Called on app
 * boot so a misbuilt installer fails loudly with a useful message instead of
 * silently breaking the first sign-in attempt.
 */
export function assertProductionConfig(): { ok: true } | { ok: false; missing: string[] } {
  if (!app.isPackaged) return { ok: true };
  const missing: string[] = [];
  if (!config.cognitoUserPoolId)     missing.push('COGNITO_USER_POOL_ID');
  if (!config.cognitoAppClientId)    missing.push('COGNITO_APP_CLIENT_ID');
  if (!config.cognitoIdentityPoolId) missing.push('COGNITO_IDENTITY_POOL_ID');
  if (!config.dynamoTable)           missing.push('DYNAMODB_TABLE');
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}
