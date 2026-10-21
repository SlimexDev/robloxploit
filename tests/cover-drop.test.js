import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('dropping a cover selects the upload file, previews it and rejects invalid drops', () => {
  const handlers = {}, classes = new Set();
  const input = { files: [], addEventListener: (name, handler) => { handlers[name] = handler; }, dispatchEvent: event => handlers[event.type]() };
  const zone = { addEventListener: (name, handler) => { handlers[name] = handler; }, classList: { add: name => classes.add(name), remove: name => classes.delete(name) }, contains: () => false };
  const preview = {}, toast = {};
  let created = 0, revoked = 0;
  const elements = { '#image': input, '.upload-zone': zone, '#image-preview': preview, '#toast': toast };
  vm.runInNewContext(readFileSync('public/app.js', 'utf8'), {
    document: { querySelector: selector => elements[selector] || null, querySelectorAll: () => [] },
    URL: { createObjectURL: () => `blob:preview-${++created}`, revokeObjectURL: () => revoked++ },
    setTimeout: () => 1, clearTimeout() {},
    Event: class { constructor(type) { this.type = type; } },
    DataTransfer: class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } },
  });
  let prevented = 0;
  const image = { type: 'image/png', size: 1024 };
  const drop = files => handlers.drop({ preventDefault: () => prevented++, dataTransfer: { files } });
  handlers.dragover({ preventDefault: () => prevented++ });
  assert.ok(classes.has('drag-over'));
  drop([image]);
  assert.equal(input.files[0], image);
  assert.equal(preview.src, 'blob:preview-1');
  assert.equal(classes.has('drag-over'), false);
  drop([{ type: 'image/svg+xml', size: 10 }]);
  drop([{ type: 'image/jpeg', size: 3 * 1024 * 1024 + 1 }]);
  drop([image, image]);
  drop([]);
  assert.equal(created, 1);
  assert.equal(input.files[0], image);
  drop([{ type: 'image/webp', size: 100 }]);
  assert.equal(preview.src, 'blob:preview-2');
  assert.equal(revoked, 1);
  assert.equal(prevented, 7);
});
