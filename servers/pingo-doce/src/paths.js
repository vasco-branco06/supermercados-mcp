import { homedir } from 'node:os';
import { join } from 'node:path';

// ~/.pingodoce-mcp holds cookies.json (the saved session) and cache/. PINGODOCE_STATE_DIR overrides it.
export function resolveStatePaths(env = process.env) {
  const stateDir = env.PINGODOCE_STATE_DIR || join(homedir(), '.pingodoce-mcp');
  return {
    stateDir,
    cookieFile: join(stateDir, 'cookies.json'),
    cacheDir: join(stateDir, 'cache'),
  };
}
