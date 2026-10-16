import { readFileSync } from 'node:fs';
import { resolveStatePaths } from './paths.js';

// KEY=VALUE lines; blank lines and # comments ignored; optional surrounding quotes removed.
export function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

// Returns { email, password } from ~/.pingodoce-mcp/credentials.env, or null if either is missing.
// The values never leave this module except to fill the login form.
export function loadCredentials(env = process.env) {
  let values;
  try {
    values = parseEnvFile(readFileSync(resolveStatePaths(env).credentialsFile, 'utf8'));
  } catch {
    return null;
  }
  const email = values.PINGODOCE_EMAIL;
  const password = values.PINGODOCE_PASSWORD;
  return email && password ? { email, password } : null;
}
