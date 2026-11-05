import struct, numpy as np, sys, glob, os
from pathlib import Path
REPO = str(Path(__file__).resolve().parents[2])

def read_segments(path):
    b = open(path,'rb').read()
    assert b[:7]==b'DAF/SPK', b[:8]
    fmt = b[88:96]
    end = '<' if fmt.startswith(b'LTL') else '>'
    nd, ni = struct.unpack(end+'ii', b[8:16])
    fward, = struct.unpack(end+'i', b[76:80])
    segs=[]
    rec=fward
    ss = nd + (ni+1)//2
    while rec:
        off=(rec-1)*1024
        nxt,prv,nsum = struct.unpack(end+'ddd', b[off:off+24])
        for i in range(int(nsum)):
            o=off+24+i*ss*8
            st,en = struct.unpack(end+'dd', b[o:o+16])
            ints = struct.unpack(end+'6i', b[o+16:o+16+24])
            tgt,cen,frm,typ,ba,ea = ints
            segs.append(dict(path=path,start=st,end=en,target=tgt,center=cen,frame=frm,type=typ,ba=ba,ea=ea))
        rec=int(nxt)
    return segs, b, end

if __name__=='__main__':
    for p in sorted(glob.glob(os.path.join(REPO,'03_spice/spk/*.bsp'))):
        segs,_,_=read_segments(p)
        print(os.path.basename(p))
        for s in segs:
            print('   tgt',s['target'],'cen',s['center'],'frm',s['frame'],'type',s['type'],'et',round(s['start']/86400/365.25+2000,3),'->',round(s['end']/86400/365.25+2000,3))
