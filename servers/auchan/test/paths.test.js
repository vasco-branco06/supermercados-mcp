import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCredentials, parseEnvFile, resolveStatePaths } from '../src/paths.js';

function home(t) {
  const dir = mkdtempSync(join(tmpdir(), 'auchan-paths-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const put = (dir, parts, contents) => {
  const file = join(dir, ...parts);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, contents);
  return file;
};

test('parseEnvFile reads KEY=VALUE lines and ignores comments and blanks', () => {
  assert.deepEqual(parseEnvFile('# c\nAUCHAN_EMAIL = a@b.pt\r\nAUCHAN_PASSWORD="x y"\n\nexport OUTRO=1\n'), { AUCHAN_EMAIL: 'a@b.pt', AUCHAN_PASSWORD: 'x y', OUTRO: '1' });
});

test('the plugin template (empty values) gives no credentials', (t) => {
  const dir = home(t);
  put(dir, ['.supermercados-mcp', 'credentials.env'], '# Auchan\nAUCHAN_EMAIL=\nAUCHAN_PASSWORD=\nCONTINENTE_EMAIL=c@d.pt\nCONTINENTE_PASSWORD=z\n');
  assert.equal(loadCredentials({ HOME: dir }), null);
});

test('credentials come from the plugin file first, then from the server own file', (t) => {
  const dir = home(t);
  put(dir, ['.auchan-mcp', 'credentials.env'], 'AUCHAN_EMAIL=velho@x.pt\nAUCHAN_PASSWORD=velha\n');
  assert.deepEqual(loadCredentials({ HOME: dir }), { email: 'velho@x.pt', password: 'velha' }, 'only the old file exists');

  put(dir, ['.supermercados-mcp', 'credentials.env'], 'AUCHAN_EMAIL=novo@x.pt\nAUCHAN_PASSWORD=nova\n');
  assert.deepEqual(loadCredentials({ HOME: dir }), { email: 'novo@x.pt', password: 'nova' }, 'the plugin file wins');

  const own = put(dir, ['outro', 'meu.env'], 'AUCHAN_EMAIL=meu@x.pt\nAUCHAN_PASSWORD=minha\n');
  assert.deepEqual(loadCredentials({ HOME: dir, AUCHAN_ENV_PATH: own }), { email: 'meu@x.pt', password: 'minha' }, 'a path set by the person wins');
});

test('an incomplete file does not hide a complete one', (t) => {
  const dir = home(t);
  put(dir, ['.supermercados-mcp', 'credentials.env'], 'AUCHAN_EMAIL=so-email@x.pt\n');
  put(dir, ['.auchan-mcp', 'credentials.env'], 'AUCHAN_EMAIL=a@x.pt\nAUCHAN_PASSWORD=p\n');
  assert.deepEqual(loadCredentials({ HOME: dir }), { email: 'a@x.pt', password: 'p' });
});

test('the state paths default to the home folder', () => {
  const paths = resolveStatePaths({ HOME: '/h' });
  assert.equal(paths.cookieFile.replace(/\\/g, '/'), '/h/.auchan-mcp/cookies.json');
  assert.equal(paths.sharedCredentialFile.replace(/\\/g, '/'), '/h/.supermercados-mcp/credentials.env');
});
