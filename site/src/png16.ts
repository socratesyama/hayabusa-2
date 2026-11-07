// Minimal PNG decoder for 16-bit grayscale (canvas would squash it to 8 bit). Uses DecompressionStream.
export async function decodeGray16(url: string): Promise<{ w: number; h: number; data: Uint16Array }> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const dv = new DataView(buf.buffer);
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0; const idat: Uint8Array[] = [];
  while (p < buf.length) {
    const len = dv.getUint32(p); const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = buf[p + 16]; ctype = buf[p + 17]; }
    else if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 16 || ctype !== 0) throw new Error(`unexpected PNG format depth=${depth} ctype=${ctype}`);
  const comp = new Uint8Array(idat.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of idat) { comp.set(a, o); o += a.length; }
  const ds = new DecompressionStream('deflate');
  const raw = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer());
  const bpp = 2, stride = w * bpp; const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const src = y * (stride + 1) + 1; const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y > 0 ? out[dst - stride + x] : 0, c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  const data = new Uint16Array(w * h); for (let i = 0; i < data.length; i++) data[i] = (out[i * 2] << 8) | out[i * 2 + 1];
  return { w, h, data };
}
