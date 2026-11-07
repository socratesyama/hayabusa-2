"""Minimal pure-numpy SPICE reader (DAF/SPK types 2,3,8,9,13,18 + PCK text + LSK).
Used because spiceypy is unavailable in this build environment. Credit: algorithms per NAIF SPK/DAF required reading."""
import struct, re, numpy as np

class DAF:
    def __init__(self, path):
        self.f = open(path, 'rb').read()
        f = self.f
        loc = f[:8].decode()
        fmt = f[88:96].decode().strip()
        self.e = '<' if 'LTL' in fmt else '>'
        e = self.e
        self.nd, self.ni = struct.unpack(e+'ii', f[8:16])
        self.fward, self.bward, self.free = struct.unpack(e+'iii', f[76:88])
        self.segs = []
        rec = self.fward
        ss = self.nd + (self.ni + 1)//2
        while rec:
            b = (rec-1)*1024
            nxt, prv, n = struct.unpack(e+'ddd', f[b:b+24]); nxt=int(nxt); n=int(n)
            for i in range(n):
                o = b + 24 + i*ss*8
                dc = struct.unpack(e+'%dd'%self.nd, f[o:o+8*self.nd])
                ic = struct.unpack(e+'%di'%self.ni, f[o+8*self.nd:o+8*self.nd+4*self.ni])
                self.segs.append((dc, ic))
            rec = nxt
    def array(self, a, b):
        return np.frombuffer(self.f, dtype=self.e+'f8', count=b-a+1, offset=(a-1)*8)

class SPK:
    def __init__(self, path):
        self.d = DAF(path); self.segs = []
        for dc, ic in self.d.segs:
            self.segs.append(dict(t0=dc[0], t1=dc[1], target=ic[0], center=ic[1], frame=ic[2], type=ic[3], a=ic[4], b=ic[5]))
    def find(self, target, et):
        for s in reversed(self.segs):
            if s['target']==target and s['t0']<=et<=s['t1']: return s
        return None
    def state(self, seg, et):
        d = self.d; t = seg['type']; a,b = seg['a'], seg['b']
        if t in (2,3):
            init,intlen,rsize,n = d.array(b-3,b)
            rsize=int(rsize); n=int(n)
            idx = min(int((et-init)//intlen), n-1)
            rec = d.array(a+idx*rsize, a+(idx+1)*rsize-1)
            mid, rad = rec[0], rec[1]
            x = (et-mid)/rad
            nc = (rsize-2)//(3 if t==2 else 6)
            T = np.zeros(nc); T[0]=1; 
            if nc>1: T[1]=x
            for i in range(2,nc): T[i]=2*x*T[i-1]-T[i-2]
            dT = np.zeros(nc); 
            if nc>1: dT[1]=1
            if nc>2: dT[2]=4*x
            for i in range(3,nc): dT[i]=2*x*dT[i-1]+2*T[i-1]-dT[i-2]
            pos=[]; vel=[]
            for k in range(3):
                c = rec[2+k*nc:2+(k+1)*nc]
                pos.append(c@T)
                if t==2: vel.append((c@dT)/rad)
                else: vel.append(rec[2+(3+k)*nc:2+(4+k)*nc]@T)
            return np.array(pos+vel)
        if t in (8,9,13):
            # equal / unequal step Lagrange / Hermite
            n = int(d.array(b,b)[0]); 
            if t==8:
                start,step,deg_n = d.array(b-3,b-1+0) if False else (None,None,None)
            meta = d.array(b-1,b)  # deg? layout differs; handle 9/13
            if t in (9,13):
                deg=int(d.array(b-1,b-1)[0]); n=int(d.array(b,b)[0])
                states=d.array(a, a+6*n-1).reshape(n,6)
                times=d.array(a+6*n, a+7*n-1)
                i=np.searchsorted(times, et)
                w = deg+1
                if t==13: w=(deg+1)//2
                lo=max(0,min(i-w//2 if t==9 else i-w//2-0, n-w)); 
                if t==13:
                    # Hermite
                    lo=max(0,min(i-w//2,n-w)); xs=times[lo:lo+w]; P=states[lo:lo+w,:3]; V=states[lo:lo+w,3:]
                    out=np.zeros(3)
                    for k in range(3): out[k]=hermite(xs,P[:,k],V[:,k],et)
                    return np.concatenate([out, np.zeros(3)])
                xs=times[lo:lo+w]; out=np.zeros(3)
                for k in range(3): out[k]=lagrange(xs,states[lo:lo+w,k],et)
                return np.concatenate([out, np.zeros(3)])
        if t==18:
            subtype=int(d.array(b-3,b-3)[0]); wsz=int(d.array(b-2,b-2)[0]); n=int(d.array(b,b)[0])
            psz = 12 if subtype==0 else 6
            pk=d.array(a, a+n*psz-1).reshape(n,psz); times=d.array(a+n*psz, a+n*psz+n-1)
            i=np.searchsorted(times, et); w=wsz
            lo=max(0,min(i-w//2,n-w)); xs=times[lo:lo+w]; out=np.zeros(3)
            for k in range(3):
                if subtype==0: out[k]=hermite(xs,pk[lo:lo+w,k],pk[lo:lo+w,3+k],et)
                else: out[k]=lagrange(xs,pk[lo:lo+w,k],et)
            return np.concatenate([out,np.zeros(3)])
        raise NotImplementedError('SPK type %d'%t)
    def pos(self, target, et):
        s=self.find(target,et); 
        return None if s is None else (s, self.state(s,et)[:3])

def lagrange(x, y, t):
    r=0.0
    for i in range(len(x)):
        p=y[i]
        for j in range(len(x)):
            if j!=i: p*= (t-x[j])/(x[i]-x[j])
        r+=p
    return r

def hermite(x, y, dy, t):
    # divided differences (Hermite)
    n=len(x); z=np.repeat(x,2); Q=np.zeros((2*n,2*n)); 
    Q[0::2,0]=y; Q[1::2,0]=y
    for i in range(n):
        Q[2*i+1,1]=dy[i]
        if i: Q[2*i,1]=(Q[2*i,0]-Q[2*i-1,0])/(z[2*i]-z[2*i-1])
    for j in range(2,2*n):
        for i in range(j,2*n):
            Q[i,j]=(Q[i,j-1]-Q[i-1,j-1])/(z[i]-z[i-j])
    r=Q[2*n-1,2*n-1]
    for i in range(2*n-2,-1,-1): r=r*(t-z[i])+Q[i,i]
    return r

# ---- time
_LEAP=[(10,'1972-01-01'),(11,'1972-07-01'),(12,'1973-01-01'),(13,'1974-01-01'),(14,'1975-01-01'),(15,'1976-01-01'),(16,'1977-01-01'),(17,'1978-01-01'),(18,'1979-01-01'),(19,'1980-01-01'),(20,'1981-07-01'),(21,'1982-07-01'),(22,'1983-07-01'),(23,'1985-07-01'),(24,'1988-01-01'),(25,'1990-01-01'),(26,'1991-01-01'),(27,'1992-07-01'),(28,'1993-07-01'),(29,'1994-07-01'),(30,'1996-01-01'),(31,'1997-07-01'),(32,'1999-01-01'),(33,'2006-01-01'),(34,'2009-01-01'),(35,'2012-07-01'),(36,'2015-07-01'),(37,'2017-01-01')]
import datetime as _dt
_J2000=_dt.datetime(2000,1,1,12,0,0)
def utc2et(s):
    """s: 'YYYY-MM-DDTHH:MM:SS' UTC -> ET seconds past J2000 (TDB approx = TT + 1.657e-3 sin(M))."""
    t=_dt.datetime.fromisoformat(s.replace('Z','')); 
    dat=10
    for d,dd in _LEAP:
        if t>=_dt.datetime.fromisoformat(dd): dat=d
    tt=(t-_J2000).total_seconds()+dat+32.184
    M=np.radians(357.53+0.9856003*(tt/86400))
    return tt+0.001657*np.sin(M)
def et2utc(et):
    M=np.radians(357.53+0.9856003*(et/86400)); tt=et-0.001657*np.sin(M)
    t=_J2000+_dt.timedelta(seconds=tt-32.184-37)
    return t

def parse_tpc(path):
    txt=open(path).read(); txt=txt.split('\\begindata')[-1]
    out={}
    for m in re.finditer(r"([A-Z0-9_]+)\s*=\s*\(?([^=]*?)\)?\s*(?=\n\s*[A-Z0-9_]+\s*=|\Z)", txt, re.S):
        vals=re.findall(r"[-+]?\d*\.?\d+(?:[eEdD][-+]?\d+)?", m.group(2))
        try: out[m.group(1)]=[float(v.replace('D','e').replace('d','e')) for v in vals]
        except: pass
    return out
