"""SfM点群(316k, PLY)を、ブラウザで描ける軽い形式へ変換する。
出力 data/pencil.bin: <4I n, scale, 0, 0> + int16 xyz(m*scale) + int8 法線 + uint8 輝度(ONCベースマップ由来)。
法線は点群の近傍(k=16)から主成分分析で推定した派生値(DERIVED)。外向きに揃える。"""
import numpy as np, os, struct, sys
from scipy.spatial import cKDTree
HERE=os.path.dirname(os.path.abspath(__file__)); REPO=os.path.abspath(os.path.join(HERE,'..','..'))
src=REPO+'/10_pointclouds/sfm_3m/ryugu_pointcloud_sfm3m_316k_color_web.ply'
raw=open(src,'rb').read(); hl=raw.index(b'end_header\n')+11
n=int(raw[:hl].split(b'element vertex ')[1].split(b'\n')[0])
dt=np.dtype([('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1')])
a=np.frombuffer(raw,dtype=dt,count=n,offset=hl)
P=np.stack([a['x'],a['y'],a['z']],1).astype(np.float64); rgb=np.stack([a['r'],a['g'],a['b']],1)
print('点数',n,'範囲 m',P.min(0).round(1),P.max(0).round(1),'重心',P.mean(0).round(2))
rad=np.linalg.norm(P-P.mean(0),axis=1); print('重心からの距離 m: 最小%.0f 中央%.0f 最大%.0f'%(rad.min(),np.median(rad),rad.max()))
# 現在使っている形状メッシュ(200k)との整合性
def load_mesh(p):
    v=[]
    for l in open(p):
        if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
    return np.array(v)
M=load_mesh(REPO+'/01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj')
if np.abs(M).max()<5: M*=1000   # km→m の場合
d,_=cKDTree(M).query(P[::20]); print('メッシュ頂点までの距離 m: 中央%.2f 90%%点%.2f 最大%.2f'%(np.median(d),np.percentile(d,90),d.max()))
print('メッシュ範囲 m',M.min(0).round(1),M.max(0).round(1))
tree=cKDTree(P); _,nb=tree.query(P,k=16)
Q=P[nb]-P[nb].mean(1,keepdims=True)
C=np.einsum('nki,nkj->nij',Q,Q)
w,V=np.linalg.eigh(C); N=V[:,:,0]
cen=P.mean(0); flip=(np.einsum('ni,ni->n',N,P-cen)<0); N[flip]*=-1
dd,_=tree.query(P,k=2); print('近傍点間隔 m: 中央%.2f'%np.median(dd[:,1]))
S=60.0
assert np.abs(P).max()*S<32767
lum=(rgb.astype(np.float32)@np.array([.299,.587,.114],np.float32)).astype(np.uint8)
out=REPO+'/site/data/pencil.bin'
with open(out,'wb') as f:
    f.write(struct.pack('<4I',n,int(S),0,0)); f.write(np.round(P*S).astype('<i2').tobytes())
    f.write(np.round(N*127).astype('i1').tobytes()); f.write(lum.tobytes())
print('pencil.bin',os.path.getsize(out)//1024,'KB','間隔中央',round(float(np.median(dd[:,1])),2))
