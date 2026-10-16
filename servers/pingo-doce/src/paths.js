import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ~/.pingodoce-mcp holds cookies.json (the saved session) and cache/. PINGODOCE_STATE_DIR overrides it.
export function resolveStatePaths(env = process.env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  const stateDir = env.PINGODOCE_STATE_DIR || join(home, '.pingodoce-mcp');
  return {
    stateDir,
    cookieFile: join(stateDir, 'cookies.json'),
    cacheDir: join(stateDir, 'cache'),
    // Where the plugin's first run creates the template, shared by every supermarket.
    sharedCredentialFile: env.SUPERMERCADOS_MCP_CREDENTIALS || join(env.SUPERMERCADOS_MCP_DIR || join(home, '.supermercados-mcp'), 'credentials.env'),
    ownCredentialFile: join(stateDir, 'credentials.env'),
  };
}

// KEY=VALUE lines; blank lines and # comments ignored; optional surrounding quotes removed.
export function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

// "912 345 678", "+351 912345678" and "00351-912-345-678" all become "912345678". Anything else is ignored.
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[\s.-]/g, '').replace(/^(\+|00)351/, '');
  return /^\d{9}$/.test(digits) ? digits : null;
}

// The phone is only used to fill in the first step of the login window. Pingo Doce has no password:
// every login needs a new code that arrives by SMS or email, and the person types that code.
// Order: PINGODOCE_PHONE, PINGODOCE_ENV_PATH, the plugin's shared file, then ~/.pingodoce-mcp/credentials.env.
export function loadPhone(env = process.env) {
  const direct = normalizePhone(env.PINGODOCE_PHONE);
  if (direct) return direct;
  const { sharedCredentialFile, ownCredentialFile } = resolveStatePaths(env);
  for (const file of [env.PINGODOCE_ENV_PATH, sharedCredentialFile, ownCredentialFile]) {
    if (!file || !existsSync(file)) continue;
    const phone = normalizePhone(parseEnvFile(readFileSync(file, 'utf8')).PINGODOCE_PHONE);
    if (phone) return phone;
  }
  return null;
}
