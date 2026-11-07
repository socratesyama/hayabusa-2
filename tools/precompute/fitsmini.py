"""Minimal FITS image reader (astropy unavailable). Returns list of (header dict, ndarray float32) for each HDU with data."""
import numpy as np, re
_DT = {8: '>u1', 16: '>i2', 32: '>i4', -32: '>f4', -64: '>f8'}
def _hdr(buf, pos):
    h = {}; 
    while True:
        blk = buf[pos:pos+2880].decode('latin1'); pos += 2880
        end = False
        for i in range(0, 2880, 80):
            c = blk[i:i+80]; k = c[:8].strip()
            if k == 'END': end = True; break
            if c[8:10] == '= ':
                v = c[10:].split('/')[0].strip() if not c[10:].strip().startswith("'") else c[10:].split("'")[1]
                h[k] = v
        if end: return h, pos
def read_fits(path):
    buf = open(path, 'rb').read(); pos = 0; out = []
    while pos < len(buf):
        h, pos = _hdr(buf, pos)
        bp = int(h['BITPIX']); n = int(h.get('NAXIS', 0)); shape = [int(h['NAXIS%d' % (i+1)]) for i in range(n)][::-1]
        size = abs(bp)//8 * (int(np.prod(shape)) if shape else 0)
        if size:
            a = np.frombuffer(buf, dtype=_DT[bp], count=int(np.prod(shape)), offset=pos).reshape(shape).astype('f4')
            a = a * float(h.get('BSCALE', 1)) + float(h.get('BZERO', 0)); out.append((h, a))
        pos += (size + 2879)//2880*2880
    return out
