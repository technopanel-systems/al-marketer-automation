// A small zip writer (deflate, UTF-8 names) so a package can hold files that are not in git, with Windows'
// "Extract All" as the only tool needed on the other side. Up to 4 GB (no zip64).
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';

const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
const dosDate = (d) => (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

// entries: [{ name: 'Al-Marketer/app/server.js', data: Buffer, mtime?: Date }] → the zip file as a Buffer.
export function makeZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data, mtime = new Date() } of entries) {
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
    const packed = deflateRawSync(data, { level: 6 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(dosTime(mtime), 10);
    head.writeUInt16LE(dosDate(mtime), 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(stored ? 0 : 8, 10);
    dir.writeUInt16LE(dosTime(mtime), 12);
    dir.writeUInt16LE(dosDate(mtime), 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(head, nameBuf, body);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + body.length;
    if (offset > 0xffffffff) throw new Error('The package is larger than 4 GB');
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

// Reads the names and contents back (for tests and the final check).
export function readZip(buf) {
  const out = [];
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(endAt + 10);
  let p = buf.readUInt32LE(endAt + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    out.push({ name, data, ok: (crc32(data) >>> 0) === buf.readUInt32LE(p + 16) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
