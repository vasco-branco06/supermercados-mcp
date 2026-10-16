#!/usr/bin/env node
// Starts continente-mcp (by David Marques) for the plugin. Only addition: when the plugin's shared
// credentials file has a Continente email and password, continente-mcp is pointed at it
// (CONTINENTE_ENV_PATH); otherwise it keeps its own default (~/.continente/credentials.env).
// continente-mcp itself is run unchanged, straight from npm.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { credentialsPath } from './credenciais.js';

export function hasContinenteCredentials(file) {
  if (!existsSync(file)) return false;
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(CONTINENTE_EMAIL|CONTINENTE_PASSWORD)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return Boolean(values.CONTINENTE_EMAIL && values.CONTINENTE_PASSWORD);
}

export function continenteEnv(env = process.env) {
  if (env.CONTINENTE_ENV_PATH) return env;
  const file = credentialsPath(env);
  return hasContinenteCredentials(file) ? { ...env, CONTINENTE_ENV_PATH: file } : env;
}

function start() {
  const windows = process.platform === 'win32';
  const child = spawn(windows ? 'npx.cmd' : 'npx', ['-y', 'continente-mcp'], { stdio: 'inherit', env: continenteEnv(), shell: windows });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (error) => { console.error(error.message); process.exit(1); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) start();
