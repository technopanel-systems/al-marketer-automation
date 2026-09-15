// multipart/form-data (forms with file uploads) without a library. Text fields come back as URLSearchParams, so
// handlers read them exactly like a normal form; files come back as { field, filename, contentType, data }.

export function boundaryOf(contentType = '') {
  const m = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return m ? (m[1] || m[2]).trim() : null;
}

export function parseMultipart(buf, boundary) {
  const fields = new URLSearchParams();
  const files = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(delimiter);
  while (pos !== -1) {
    pos += delimiter.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // closing "--"
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
    const headerEnd = buf.indexOf('\r\n\r\n', pos);
    if (headerEnd === -1) break;
    const headers = buf.toString('utf8', pos, headerEnd);
    const next = buf.indexOf(delimiter, headerEnd + 4);
    if (next === -1) break;
    const data = buf.subarray(headerEnd + 4, next - 2); // part ends with CRLF before the next delimiter
    const disposition = headers.match(/content-disposition:[^\r\n]*/i)?.[0] || '';
    const name = disposition.match(/\bname="([^"]*)"/i)?.[1];
    const filename = disposition.match(/\bfilename\*=UTF-8''([^;\r\n]+)/i)?.[1] ? decodeURIComponent(disposition.match(/\bfilename\*=UTF-8''([^;\r\n]+)/i)[1]) : disposition.match(/\bfilename="([^"]*)"/i)?.[1];
    if (name !== undefined) {
      if (filename !== undefined) {
        if (filename && data.length) files.push({ field: name, filename: filename.split(/[\\/]/).pop(), contentType: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream', data: Buffer.from(data) });
      } else fields.append(name, data.toString('utf8'));
    }
    pos = next;
  }
  return { fields, files };
}
