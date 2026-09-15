import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMultipart, boundaryOf } from '../../app/multipart.js';

test('form fields and uploaded files are read from a multipart body, including Arabic and binary content', async () => {
  const form = new FormData();
  form.append('name', 'مصنع مناحي');
  form.append('socials', 'instagram.com/a');
  form.append('socials', 'tiktok.com/@a');
  form.append('files', new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x0d, 0x0a, 0x2d, 0x2d])]), 'تقرير الاجتماع.docx');
  form.append('files', new Blob(['plain notes\r\n--not a boundary']), 'notes.txt');
  form.append('empty', new Blob([]), '');
  const req = new Request('http://x/', { method: 'POST', body: form });
  const type = req.headers.get('content-type');
  const buf = Buffer.from(await req.arrayBuffer());
  const { fields, files } = parseMultipart(buf, boundaryOf(type));
  assert.equal(fields.get('name'), 'مصنع مناحي');
  assert.deepEqual(fields.getAll('socials'), ['instagram.com/a', 'tiktok.com/@a']);
  assert.equal(files.length, 2, 'an empty file input is ignored');
  assert.equal(files[0].filename, 'تقرير الاجتماع.docx');
  assert.deepEqual([...files[0].data], [0x50, 0x4b, 0x03, 0x04, 0x0d, 0x0a, 0x2d, 0x2d], 'binary bytes survive, even CRLF and dashes');
  assert.equal(files[1].data.toString(), 'plain notes\r\n--not a boundary');
  assert.equal(boundaryOf('multipart/form-data; boundary="abc"'), 'abc');
});
