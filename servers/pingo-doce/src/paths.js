import { homedir } from 'node:os';
import { join } from 'node:path';

// ~/.pingodoce-mcp holds credentials.env, cookies.json and cache/. PINGODOCE_STATE_DIR overrides it.
export function resolveStatePaths(env = process.env) {
  const stateDir = env.PINGODOCE_STATE_DIR || join(homedir(), '.pingodoce-mcp');
  return {
    stateDir,
    credentialsFile: env.PINGODOCE_ENV_PATH || join(stateDir, 'credentials.env'),
    cookieFile: join(stateDir, 'cookies.json'),
    cacheDir: join(stateDir, 'cache'),
  };
}
