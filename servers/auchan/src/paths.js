import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveStatePaths(env = process.env) {
  const stateDir = env.AUCHAN_STATE_DIR || join(env.HOME || env.USERPROFILE || homedir(), '.auchan-mcp');
  return {
    stateDir,
    cacheDir: join(stateDir, 'cache'),
    cookieFile: join(stateDir, 'cookies.json'),
  };
}
