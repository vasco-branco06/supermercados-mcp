import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { TEMPLATE, credentialsPath, editorCommand, ensureTemplate, run } from './credenciais.js';
import { continenteEnv, hasContinenteCredentials } from './iniciar-continente.js';

function tempFile(t) {
  const dir = mkdtempSync(join(tmpdir(), 'credenciais-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'pasta', 'credentials.env');
}

test('the template has an email and a password line for Continente and Auchan, and explains Pingo Doce', () => {
  for (const key of ['CONTINENTE_EMAIL=', 'CONTINENTE_PASSWORD=', 'AUCHAN_EMAIL=', 'AUCHAN_PASSWORD=']) {
    assert.ok(TEMPLATE.split('\n').includes(key), key);
  }
  assert.match(TEMPLATE, /Pingo Doce: entra com o número de telemóvel/);
  assert.ok(!/PINGODOCE_/.test(TEMPLATE), 'no password line for a login that has no password');
});

test('ensureTemplate creates the file once and never overwrites it', (t) => {
  const file = tempFile(t);
  assert.equal(ensureTemplate(file), true);
  assert.equal(readFileSync(file, 'utf8'), TEMPLATE);
  writeFileSync(file, 'AUCHAN_EMAIL=a@b.pt\n');
  assert.equal(ensureTemplate(file), false);
  assert.equal(readFileSync(file, 'utf8'), 'AUCHAN_EMAIL=a@b.pt\n');
});

test('the first run creates the file and tells Claude what to say; later runs are silent', (t) => {
  const file = tempFile(t);
  const env = { SUPERMERCADOS_MCP_CREDENTIALS: file };
  const opened = [];
  let out = '';
  const first = run({ argv: [], env, write: (s) => { out += s; }, open: (f) => { opened.push(f); return true; } });
  assert.equal(first.created, true);
  assert.deepEqual(opened, [file], 'the editor opens that file');
  assert.ok(existsSync(file));
  assert.ok(out.includes(file), 'it names the file');
  assert.match(out, /abriu o Bloco de Notas/);
  assert.match(out, /Pingo Doce não precisa de nada aí/);

  const quiet = { SUPERMERCADOS_MCP_CREDENTIALS: tempFile(t), SUPERMERCADOS_MCP_NO_EDITOR: '1' };
  const noEditor = run({ argv: [], env: quiet, write: () => {}, open: () => { throw new Error('must not open'); } });
  assert.equal(noEditor.opened, false, 'SUPERMERCADOS_MCP_NO_EDITOR=1 only creates the file');

  out = '';
  const second = run({ argv: [], env, write: (s) => { out += s; } });
  assert.deepEqual([second.created, second.opened, out], [false, false, '']);
});

test('--forcar shows the file again without touching what is in it', (t) => {
  const file = tempFile(t);
  const env = { SUPERMERCADOS_MCP_CREDENTIALS: file, SUPERMERCADOS_MCP_NO_EDITOR: '1' };
  run({ argv: [], env, write: () => {} });
  writeFileSync(file, 'AUCHAN_EMAIL=a@b.pt\nAUCHAN_PASSWORD=x\n');
  let out = '';
  run({ argv: ['--forcar'], env, write: (s) => { out += s; } });
  assert.ok(out.includes(file));
  assert.equal(readFileSync(file, 'utf8'), 'AUCHAN_EMAIL=a@b.pt\nAUCHAN_PASSWORD=x\n');
  assert.ok(!out.includes('a@b.pt'), 'values from the file are never printed');
});

test('the file lives in ~/.supermercados-mcp unless told otherwise', () => {
  assert.match(credentialsPath({}).split(String.fromCharCode(92)).join('/'), /\.supermercados-mcp\/credentials\.env$/);
  assert.equal(credentialsPath({ SUPERMERCADOS_MCP_CREDENTIALS: 'x/y.env' }), 'x/y.env');
});

test('each system opens its own editor', () => {
  assert.deepEqual(editorCommand('f', 'win32'), ['notepad.exe', ['f']]);
  assert.deepEqual(editorCommand('f', 'darwin'), ['open', ['-e', 'f']]);
  assert.deepEqual(editorCommand('f', 'linux'), ['xdg-open', ['f']]);
});

test('continente-mcp is pointed at the shared file only when it has Continente credentials', (t) => {
  const file = tempFile(t);
  ensureTemplate(file);
  assert.equal(hasContinenteCredentials(file), false, 'the empty template does not count');
  const env = { SUPERMERCADOS_MCP_CREDENTIALS: file, PATH: 'x' };
  assert.equal(continenteEnv(env).CONTINENTE_ENV_PATH, undefined, 'its own default file stays in charge');

  writeFileSync(file, 'CONTINENTE_EMAIL=a@b.pt\nCONTINENTE_PASSWORD="segredo"\n');
  assert.equal(hasContinenteCredentials(file), true);
  assert.equal(continenteEnv(env).CONTINENTE_ENV_PATH, file);
  assert.equal(continenteEnv({ ...env, CONTINENTE_ENV_PATH: 'outro.env' }).CONTINENTE_ENV_PATH, 'outro.env', 'a path set by the person wins');
});
