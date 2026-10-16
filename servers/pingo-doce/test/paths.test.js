import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadPhone, normalizePhone, parseEnvFile } from '../src/paths.js';

function home(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pd-paths-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const put = (dir, parts, contents) => {
  const file = join(dir, ...parts);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, contents);
  return file;
};

test('normalizePhone accepts the usual ways of writing a Portuguese mobile number', () => {
  for (const value of ['912345678', '912 345 678', '+351 912345678', '00351-912-345-678', ' 912.345.678 ']) {
    assert.equal(normalizePhone(value), '912345678', value);
  }
  for (const value of ['', null, undefined, '12345', '9123456789', 'abc', '+44 7911 123456']) {
    assert.equal(normalizePhone(value), null, String(value));
  }
});

test('parseEnvFile reads KEY=VALUE lines and ignores comments', () => {
  assert.deepEqual(parseEnvFile('# c\nPINGODOCE_PHONE = "912 345 678"\r\nAUCHAN_EMAIL=a@b.pt\n\n'), { PINGODOCE_PHONE: '912 345 678', AUCHAN_EMAIL: 'a@b.pt' });
});

test('the phone comes from the plugin file, from the server own file, or from the environment', (t) => {
  const dir = home(t);
  assert.equal(loadPhone({ HOME: dir }), null, 'no file, no phone');

  put(dir, ['.supermercados-mcp', 'credentials.env'], 'AUCHAN_EMAIL=a@b.pt\nPINGODOCE_PHONE=\n');
  assert.equal(loadPhone({ HOME: dir }), null, 'the empty template gives no phone');

  put(dir, ['.pingodoce-mcp', 'credentials.env'], 'PINGODOCE_PHONE=911111111\n');
  assert.equal(loadPhone({ HOME: dir }), '911111111', 'the server own file is the fallback');

  put(dir, ['.supermercados-mcp', 'credentials.env'], 'PINGODOCE_PHONE=+351 922 222 222\n');
  assert.equal(loadPhone({ HOME: dir }), '922222222', 'the plugin file wins');

  assert.equal(loadPhone({ HOME: dir, PINGODOCE_PHONE: '933333333' }), '933333333', 'the environment wins over files');
});
