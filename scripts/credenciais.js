#!/usr/bin/env node
// Shared credentials file for the plugin: ~/.supermercados-mcp/credentials.env.
// Run with no arguments by the plugin's SessionStart hook: when the file does not exist yet it
// creates a template and opens it in the system editor (Notepad on Windows). With --forcar it
// opens the file again. Nothing here ever reads or prints a value from the file.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATE = `# Credenciais dos supermercados. Este ficheiro fica só neste computador.
# Preenche os supermercados onde queres usar o carrinho, carrega em Ctrl+S e fecha.
# Sem aspas e sem espaços à volta do =. Os que deixares em branco ficam só com a pesquisa.

# Continente
CONTINENTE_EMAIL=
CONTINENTE_PASSWORD=

# Auchan
AUCHAN_EMAIL=
AUCHAN_PASSWORD=

# Pingo Doce: entra com o número de telemóvel e um código que chega por SMS, por isso
# não há email nem palavra-passe para guardar aqui. Quando pedires o carrinho do
# Pingo Doce, abre-se uma janela do browser para entrares tu.
`;

export function credentialsPath(env = process.env) {
  return env.SUPERMERCADOS_MCP_CREDENTIALS || join(env.SUPERMERCADOS_MCP_DIR || join(homedir(), '.supermercados-mcp'), 'credentials.env');
}

// Creates the template when the file is missing and never overwrites an existing one.
export function ensureTemplate(file) {
  if (existsSync(file)) return false;
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, TEMPLATE, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* Windows keeps the profile folder private by default */ }
  return true;
}

export function editorCommand(file, platform = process.platform) {
  if (platform === 'win32') return ['notepad.exe', [file]];
  if (platform === 'darwin') return ['open', ['-e', file]];
  return ['xdg-open', [file]];
}

function openInEditor(file) {
  const [command, args] = editorCommand(file);
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function run({ argv = process.argv.slice(2), env = process.env, write = (s) => process.stdout.write(s), open = openInEditor } = {}) {
  const file = credentialsPath(env);
  const again = argv.includes('--forcar');
  const created = ensureTemplate(file);
  if (!created && !again) return { file, created, opened: false };
  const opened = env.SUPERMERCADOS_MCP_NO_EDITOR === '1' ? false : open(file);
  // The text of a SessionStart hook reaches Claude, which passes it on to the person.
  write(opened
    ? `O plugin supermercados-mcp abriu o Bloco de Notas com o ficheiro de credenciais (${file}). Diz à pessoa para preencher o email e a palavra-passe dos supermercados onde quer usar o carrinho, guardar com Ctrl+S e fechar. O Pingo Doce não precisa de nada aí: entra por uma janela, com um código SMS. A pesquisa e a comparação de preços funcionam sem este ficheiro.\n`
    : `O ficheiro de credenciais do plugin supermercados-mcp está em ${file}. Se a pessoa quiser usar o carrinho, tem de o abrir e preencher o email e a palavra-passe do Continente e do Auchan.\n`);
  return { file, created, opened };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
