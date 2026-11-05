import numpy as np, glob, os, json, datetime as dt, struct
from PIL import Image
R=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
OUT=R+'site/data/'
os.makedirs(OUT,exist_ok=True)

def load_obj(p):
    v=[];f=[]
    for line in open(p):
        if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('f '): f.append([int(t.split('/')[0])-1 for t in line.split()[1:4]])
    return np.array(v,dtype=np.float64)*1000.0, np.array(f,dtype=np.uint32)   # km -> m

def write_mesh(name, v, f):
    scale=60.0  # int16 / 60 = m (±546 m)
    q=np.round(v*scale).astype('<i2')
    assert np.abs(v).max()*scale<32767, np.abs(v).max()
    with open(OUT+name,'wb') as fh:
        fh.write(struct.pack('<4I', len(v), len(f), int(scale), 0))
        fh.write(q.tobytes()); fh.write(f.astype('<u4').tobytes())
    print(name, len(v),'verts',len(f),'tris', os.path.getsize(OUT+name)//1024,'KB')

if __name__=='__main__':
    v200,f200=load_obj(R+'01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj')
    v49,f49=load_obj(R+'01_shape_models/ryugu_shape_spc_49k_v20200323_web.obj')
    print('半径 min/max m', np.linalg.norm(v200,axis=1).min(), np.linalg.norm(v200,axis=1).max())
    write_mesh('ryugu_49k.bin',v49,f49); write_mesh('ryugu_200k.bin',v200,f200)

    # --- LIDAR 実測点群 ---
    pts=[]
    for fn in sorted(glob.glob(R+'10_pointclouds/lidar_l2_topo/*.csv')):
        for line in open(fn):
            a=line.strip().split(',')
            if len(a)<11: continue
            try:
                t=dt.datetime.fromisoformat(a[0]).replace(tzinfo=dt.timezone.utc).timestamp()
                pts.append((t,float(a[5]),float(a[6]),float(a[7]),float(a[1])))
            except Exception: pass
    P=np.array(pts); P=P[np.argsort(P[:,0])]
    print('LIDAR点', len(P), '期間', dt.datetime.fromtimestamp(P[0,0],dt.timezone.utc), '→', dt.datetime.fromtimestamp(P[-1,0],dt.timezone.utc))
    r=np.linalg.norm(P[:,1:4],axis=1); print('半径 m', r.min(), np.median(r), r.max(), ' 測距 km', P[:,4].min()/1000, P[:,4].max()/1000)
    t0=P[0,0]
    q=np.round(P[:,1:4]*60).astype('<i2')
    tt=(P[:,0]-t0).astype('<f4')
    with open(OUT+'lidar.bin','wb') as fh:
        fh.write(struct.pack('<2d',t0,60.0)); fh.write(struct.pack('<I',len(P)))
        fh.write(q.tobytes()); fh.write(tt.tobytes())
    print('lidar.bin', os.path.getsize(OUT+'lidar.bin')//1024,'KB')
    # 日ごとの点数(スキャン進行の目安)
    days=np.floor((P[:,0]-t0)/86400).astype(int); print('日数', days.max()+1)

    # --- 画像座標の規約の検証: SfM着色点群を基準に、基底地図の引き方を決める ---
    def read_ply(p):
        b=open(p,'rb').read(); h=b.index(b'end_header\n')+11
        n=int([l for l in b[:h].decode().split('\n') if l.startswith('element vertex')][0].split()[-1])
        dtp=np.dtype([('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1')])
        return np.frombuffer(b,dtype=dtp,count=n,offset=h)
    pl=read_ply(R+'10_pointclouds/sfm_3m/ryugu_pointcloud_sfm3m_316k_color_web.ply')
    xyz=np.stack([pl['x'],pl['y'],pl['z']],1).astype(float); col=pl['r'].astype(float)
    base=np.array(Image.open(R+'04_science_data/map_products/01_ONC_v-band_Basemap1/hyb2_onc_Global_01_l3dm_v06.jpg').convert('L')).astype(float)
    H,W=base.shape
    lon=np.degrees(np.arctan2(xyz[:,1],xyz[:,0]))%360; lat=np.degrees(np.arcsin(xyz[:,2]/np.linalg.norm(xyz,axis=1)))
    best=None
    for name,uf in [('lon/360',lambda l:l/360),('1-lon/360',lambda l:1-l/360)]:
        for vname,vf in [('(90-lat)/180',lambda a:(90-a)/180),('(lat+90)/180',lambda a:(a+90)/180)]:
            u=np.clip((uf(lon)*W).astype(int),0,W-1); v=np.clip((vf(lat)*H).astype(int),0,H-1)
            c=np.corrcoef(base[v,u],col)[0,1]; print(f'  u={name:10s} v={vname:14s} 相関 {c:.3f}')
