import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPreviewServer } from '../src/podglad.mjs';
test('preview serves its demo but denies local state, traversal and malformed URLs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'preview-security-'));
  const entry = 'output/demo/dashboard.html';
  await mkdir(path.dirname(path.join(root, entry)), { recursive: true });
  await writeFile(path.join(root, entry), '<h1>synthetic demo</h1>');
  await writeFile(path.join(root, '.env'), 'PRIVATE_SENTINEL');
  await mkdir(path.join(root, 'data'));
  await writeFile(path.join(root, 'data/private.json'), 'PRIVATE_SENTINEL');
  const server = createPreviewServer(root, entry);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await fetch(base + '/');
    assert.equal(ok.status, 200);
    assert.ok((await ok.text()).includes('synthetic demo'));
    for (const url of ['/.env', '/data/private.json', '/%2e%2e/.env', '/%ZZ', '/.git/config']) {
      const response = await fetch(base + url);
      assert.ok(response.status >= 400, url);
      assert.ok(!(await response.text()).includes('PRIVATE_SENTINEL'));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('preview-security-'));
    await rm(root, { recursive: true, force: true });
  }
});
