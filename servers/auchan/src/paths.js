import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveStatePaths(env = process.env) {
  const stateDir = env.AUCHAN_STATE_DIR || join(env.HOME || env.USERPROFILE || homedir(), '.auchan-mcp');
  return {
    stateDir,
    cacheDir: join(stateDir, 'cache'),
    credentialFile: join(stateDir, 'credentials.env'),
    cookieFile: join(stateDir, 'cookies.json'),
  };
}

export function parseEnvFile(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const raw = line.trim().replace(/^export\s+/, '');
    const index = raw.indexOf('=');
    if (!raw || raw.startsWith('#') || index === -1) continue;
    const key = raw.slice(0, index).trim();
    const value = raw.slice(index + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) parsed[key] = value;
  }
  return parsed;
}

// Returns { email, password } only when the credentials file has both; otherwise null.
export function loadCredentials(env = process.env) {
  const { credentialFile } = resolveStatePaths(env);
  if (!existsSync(credentialFile)) return null;
  const { AUCHAN_EMAIL: email, AUCHAN_PASSWORD: password } = parseEnvFile(readFileSync(credentialFile, 'utf8'));
  return email && password ? { email, password } : null;
}
