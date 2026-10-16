import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveStatePaths(env = process.env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  const stateDir = env.AUCHAN_STATE_DIR || join(home, '.auchan-mcp');
  return {
    stateDir,
    cacheDir: join(stateDir, 'cache'),
    // Where the plugin's first run creates the template, shared by every supermarket.
    sharedCredentialFile: env.SUPERMERCADOS_MCP_CREDENTIALS || join(env.SUPERMERCADOS_MCP_DIR || join(home, '.supermercados-mcp'), 'credentials.env'),
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

// Returns { email, password } from the first credentials file that has both, or null.
// Order: AUCHAN_ENV_PATH, the plugin's shared file, then this server's own ~/.auchan-mcp/credentials.env.
export function loadCredentials(env = process.env) {
  const { credentialFile, sharedCredentialFile } = resolveStatePaths(env);
  for (const file of [env.AUCHAN_ENV_PATH, sharedCredentialFile, credentialFile]) {
    if (!file || !existsSync(file)) continue;
    const { AUCHAN_EMAIL: email, AUCHAN_PASSWORD: password } = parseEnvFile(readFileSync(file, 'utf8'));
    if (email && password) return { email, password };
  }
  return null;
}
