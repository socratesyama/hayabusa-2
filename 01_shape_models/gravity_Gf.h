#ifndef _Z_GF_H_
#define _Z_GF_H_

#include <iostream>
#include <stdio.h>
#include <vector>
#include <map>
#include <string>
#include <math.h>

#ifndef _INC_VECTOR3_H_
#include "vector3.h"
#define _INC_VECTOR3_H_
#endif

#ifndef INDEX_SHIFT
#define INDEX_SHIFT (32)
#endif

class GravitationalField{
	
	class AdjacentFace{
	private:
		int idx_a;
		int idx_b;
	
	public:
		AdjacentFace(){
			idx_a=-1;
			idx_b=-1;
		}
		void setA(int _a){
			idx_a=_a;
		}
		void setB(int _b){
			idx_b=_b;
		}
		int getA(){
			return idx_a;
		}
		int getB(){
			return idx_b;
		}
		
	};
	
private:
	
	double const_G;//Gravitational constant
	double const_Sigma;//Polyhedron's constant dencity
	double scale;
	double simpleCalcBoundary;
	static const int index_shift=INDEX_SHIFT;
	static const double denominator_min=1.0e-19;
	
	vector3* vlist;
	std::vector<std::vector<int> > plist;
	std::map<unsigned long long int,AdjacentFace> face_index;
	std::vector<unsigned long long int> elist;
	
	std::string filename;
	
	vector3 centerOfGravity;
	double volumeOfPolygon;
	
	void loadPolygonFile();
	void makeFaceIndex();
	void calculateEdgeDyad(unsigned long long int e_idx,double E_e[][3]);
	bool TriangleIntersect(vector3 Orig,vector3 dir,vector3 v0,vector3 v1,vector3 v2,vector3* vec);
	
public:
	GravitationalField(std::string _filename,double _scale,double _G,double _Sigma,double _simpleCalcBoundary);
	GravitationalField(std::string _filename,double _scale,double _G,double _Sigma);
	GravitationalField(std::string _filename,double _scale);
	double getG();
	double getSigma();
	double getGravitationAtPoint(vector3 point,vector3* attract,double* lap);/* return Gravitational Potential, (vector3*)attract is a variable of attraction */
	vector3 getTriangleCenter(vector3 pos);
	vector3 getTriangleCenter(vector3 pos,vector3* nvec);
	bool getPolygonIntersection(vector3 pos,vector3* vec,vector3* nvec);
	vector3 getCenterOfGravity();
	
};

inline GravitationalField::GravitationalField(std::string _filename,double _scale,double _G,double _Sigma,double _simpleCalcBoundary){
	const_G=_G;
	const_Sigma=_Sigma;
	scale=_scale;
	simpleCalcBoundary=_simpleCalcBoundary;
	
	filename=_filename;
	loadPolygonFile();
	makeFaceIndex();
}

inline GravitationalField::GravitationalField(std::string _filename,double _scale,double _G,double _Sigma){
	const_G=_G;
	const_Sigma=_Sigma;
	scale=_scale;
	simpleCalcBoundary=-1.0;
	
	filename=_filename;
	loadPolygonFile();
	makeFaceIndex();
}

inline GravitationalField::GravitationalField(std::string _filename,double _scale){
	const_G=6.67259e-11;
	const_Sigma=1.0;
	scale=_scale;
	simpleCalcBoundary=-1.0;
	
	filename=_filename;
	loadPolygonFile();
	makeFaceIndex();
}

inline void GravitationalField::loadPolygonFile(){
	FILE* fp;
	int vertex_num, polygon_num;
	int index, tmp;
	std::vector<int> polygon;
	
	fp=fopen(filename.c_str(),"r");
	
	fscanf(fp,"%d",&vertex_num);
	vlist=new vector3[vertex_num];
	
	for(int i=0;i<vertex_num;i++){
		fscanf(fp,"%d",&index);
		//配列のインデックスに修正
		fscanf(fp,"%lf",&(vlist[index-1].x));
		fscanf(fp,"%lf",&(vlist[index-1].y));
		fscanf(fp,"%lf",&(vlist[index-1].z));
		
		//スケール修正
		vlist[index-1].x*=scale;
		vlist[index-1].y*=scale;
		vlist[index-1].z*=scale;
	}
	
	fscanf(fp,"%d",&polygon_num);
	
	//std::vector<int>::iterator it;
	for(int i=0;i<polygon_num;i++){
		fscanf(fp,"%d",&index);
		index--;//配列のインデックスに修正
		polygon.clear();
		for(int j=0;j<3;j++){
			fscanf(fp,"%d",&tmp);
			polygon.push_back(tmp-1);//配列のインデックスに修正
		}
		
		/* ポリゴンの法線が規則性を持っている事を検証するためのコード 
		it=polygon->begin();
		std::cout<<vlist[it[0]].x<<" "<<vlist[it[0]].y<<" "<<vlist[it[0]].z<<" ";
		std::cout<<((vlist[it[1]]-vlist[it[0]])*(vlist[it[2]]-vlist[it[0]]))%vlist[it[0]]<<std::endl;
		std::cout<<vlist[it[1]].x<<" "<<vlist[it[1]].y<<" "<<vlist[it[1]].z<<" ";
		std::cout<<((vlist[it[2]]-vlist[it[1]])*(vlist[it[0]]-vlist[it[1]]))%vlist[it[1]]<<std::endl;
		std::cout<<vlist[it[2]].x<<" "<<vlist[it[2]].y<<" "<<vlist[it[2]].z<<" ";
		std::cout<<((vlist[it[0]]-vlist[it[2]])*(vlist[it[1]]-vlist[it[2]]))%vlist[it[2]]<<std::endl;
		*/
		
		plist.push_back(polygon);
	}
	
	// for calculation of center of gravity and volume of polygon.
	double V=0;
	vector3 center(0.0,0.0,0.0);
	vector3 C(0.0,0.0,0.0);
	double dV;
	for(int i=0;i<plist.size();i++){
		dV=((vlist[(plist[i])[1]]-vlist[(plist[i])[0]])*(vlist[(plist[i])[2]]-vlist[(plist[i])[0]]))%(vlist[(plist[i])[0]]-C);
		dV/=6;
		V+=dV;
		center+=((vlist[(plist[i])[0]]+vlist[(plist[i])[1]]+vlist[(plist[i])[2]]+C)/4)*dV;
	}
	centerOfGravity=center/V;
	volumeOfPolygon=V;
	// --end-- for calculation of center of gravity and volume of polygon.
	
	std::cerr << "Number of vertices:\t\t" << vertex_num << std::endl;
	std::cerr << "Number of polygons:\t\t" << polygon_num << std::endl;
	std::cerr << "Center of gravity: ("<<centerOfGravity.x<<","<<centerOfGravity.y<<","<<centerOfGravity.z<<")"<<std::endl;// center of gravity
	std::cerr << "Volume of polygon: "<<volumeOfPolygon<<std::endl;// volume of polygon
	fclose(fp);
}

inline void GravitationalField::makeFaceIndex(){
	unsigned long long int a,b;
	unsigned long long int edge_index;
	
	for(int i=0;i<plist.size();i++){
		for(int j=0;j<3;j++){
			a=(plist[i])[j];
			b=(plist[i])[(j+1)%3];
			edge_index=((a<b)?(a<<index_shift)+b:(b<<index_shift)+a);
			if(face_index[edge_index].getA()==-1){
				face_index[edge_index].setA(i);
			}else{
				if(face_index[edge_index].getB()==-1){
					face_index[edge_index].setB(i);
					elist.push_back(edge_index);
				}
			}
		}
	}
}

inline double GravitationalField::getG(){
	return const_G;
}

inline double GravitationalField::getSigma(){
	return const_Sigma;
}

inline double GravitationalField::getGravitationAtPoint(vector3 point,vector3* attract,double* lap){
	
	// Acceralation for calculation of gravitation.
	double R;
	vector3 attract_tmp;
	R=point.abs();
	if(simpleCalcBoundary>=0.0 && R>=simpleCalcBoundary){
		// attract
		attract_tmp=(centerOfGravity-point);
		attract_tmp/=attract_tmp.abs();
		attract_tmp*=const_G*volumeOfPolygon*const_Sigma/(R*R);
		*attract=attract_tmp;
		// --
		*lap=0.0;//lap
		return const_G*volumeOfPolygon*const_Sigma/R;
	}
	//
	
	double potential=0.0;
	double laplacian=0.0;
	double r_i,r_j,e_ij;
	vector3 v_i,v_j,v_k;
	double pvec[3];
	unsigned long long int a,b;
	double attraction[3]={0.0,};
	
	std::vector<unsigned long long int>::iterator e_it;
	double E_e[3][3];
	double L_e;
	
	for(e_it=elist.begin();e_it!=elist.end();e_it++){
		a=(*e_it)>>index_shift;
		b=(*e_it)-(a<<index_shift);
		
		//calculate Edge dyad
		calculateEdgeDyad(*e_it,E_e);
		
		//calculate L_e
		r_i=(vlist[a]-point).abs();
		r_j=(vlist[b]-point).abs();
		e_ij=(vlist[b]-vlist[a]).abs();
		L_e=log((r_i+r_j+e_ij)/(r_i+r_j-e_ij));
		
		
		pvec[0]=vlist[a].x-point.x;
		pvec[1]=vlist[a].y-point.y;
		pvec[2]=vlist[a].z-point.z;
		
		
		for(int i=0;i<3;i++){
			for(int j=0; j<3; j++) {
				potential+=pvec[i]*pvec[j]*E_e[i][j]*L_e;
				attraction[i]-=pvec[j]*E_e[i][j]*L_e;
			}
		}
	}
	
	
	std::vector<std::vector<int> >::iterator f_it;
	double F_f[3][3];
	double Omega_f,numerator,denominator;
	vector3 n_f;
	
	for (f_it=plist.begin(); f_it!=plist.end(); f_it++) {
		int v[3];
		v[0]=(*f_it)[0];
		v[1]=(*f_it)[1];
		v[2]=(*f_it)[2];
		
		v_i=vlist[v[0]]-point;
		v_j=vlist[v[1]]-point;
		v_k=vlist[v[2]]-point;
		
		n_f=(vlist[v[1]]-vlist[v[0]])*(vlist[v[2]]-vlist[v[0]]);
		n_f/=n_f.abs();
		
		
		//calculate dyad
		F_f[0][0]=n_f.x*n_f.x;
		F_f[1][0]=n_f.y*n_f.x;
		F_f[2][0]=n_f.z*n_f.x;
		F_f[0][1]=n_f.x*n_f.y;
		F_f[1][1]=n_f.y*n_f.y;
		F_f[2][1]=n_f.z*n_f.y;
		F_f[0][2]=n_f.x*n_f.z;
		F_f[1][2]=n_f.y*n_f.z;
		F_f[2][2]=n_f.z*n_f.z;
		
		//calculate Omega_f
		numerator=(v_i%(v_j*v_k));
		denominator=	v_i.abs()*v_j.abs()*v_k.abs()
						+v_i.abs()*(v_j%v_k)
						+v_j.abs()*(v_k%v_i)
						+v_k.abs()*(v_i%v_j);
		Omega_f=2*atan2(numerator,denominator);
		
		pvec[0]=v_i.x;
		pvec[1]=v_i.y;
		pvec[2]=v_i.z;
		
		for(int i=0;i<3;i++){
			for(int j=0; j<3; j++) {
				potential-=pvec[i]*pvec[j]*F_f[i][j]*Omega_f;
				attraction[i]+=pvec[j]*F_f[i][j]*Omega_f;
			}
		}
		laplacian+=Omega_f;
	}
	
	(*attract).x=const_G*const_Sigma*attraction[0];
	(*attract).y=const_G*const_Sigma*attraction[1];
	(*attract).z=const_G*const_Sigma*attraction[2];
	
	(*lap)=-1*const_G*const_Sigma*laplacian;
	
	return 0.5*const_G*const_Sigma*potential;
}

inline void GravitationalField::calculateEdgeDyad(unsigned long long int e_idx,double E_e[][3]){
	vector3 nA,nB,e_ab,nAab,nBba;
	unsigned int idx_A,idx_B;
	unsigned int non_edge_point_A,non_edge_point_B;
	unsigned long long int a,b;
	
	a=(e_idx>>index_shift);
	b=e_idx-(a<<index_shift);
	
	idx_A=face_index[e_idx].getA();
	idx_B=face_index[e_idx].getB();
	
	nA=(vlist[(plist[idx_A])[1]]-vlist[(plist[idx_A])[0]])*(vlist[(plist[idx_A])[2]]-vlist[(plist[idx_A])[0]]);
	nA/=nA.abs();
	nB=(vlist[(plist[idx_B])[1]]-vlist[(plist[idx_B])[0]])*(vlist[(plist[idx_B])[2]]-vlist[(plist[idx_B])[0]]);
	nB/=nB.abs();
	
	
	for(int i=0;i<3;i++){
		if((plist[idx_A])[i]!=a&&(plist[idx_A])[i]!=b){
			non_edge_point_A=(plist[idx_A])[i];
		}
		if((plist[idx_B])[i]!=a&&(plist[idx_B])[i]!=b){
			non_edge_point_B=(plist[idx_B])[i];
		}
	}
	
	e_ab=vlist[a]-vlist[b];
	if(((vlist[non_edge_point_B]-vlist[non_edge_point_A])*nA)%e_ab<0){
		e_ab*=-1;
	}
	
	e_ab/=e_ab.abs();
	
	
	nAab=nA*e_ab;
	nBba=nB*e_ab*(-1);
	
	E_e[0][0]=nA.x*nAab.x+nB.x*nBba.x;
	E_e[1][0]=nA.y*nAab.x+nB.y*nBba.x;
	E_e[2][0]=nA.z*nAab.x+nB.z*nBba.x;
	E_e[0][1]=nA.x*nAab.y+nB.x*nBba.y;
	E_e[1][1]=nA.y*nAab.y+nB.y*nBba.y;
	E_e[2][1]=nA.z*nAab.y+nB.z*nBba.y;
	E_e[0][2]=nA.x*nAab.z+nB.x*nBba.z;
	E_e[1][2]=nA.y*nAab.z+nB.y*nBba.z;
	E_e[2][2]=nA.z*nAab.z+nB.z*nBba.z;
	
}

inline vector3 GravitationalField::getTriangleCenter(vector3 pos){
	vector3 candidate,vec,uvec;
	
	pos/=pos.abs();
	
	double max=-1;
	std::vector<std::vector<int> >::iterator f_it;
	for (f_it=plist.begin(); f_it!=plist.end(); f_it++) {
		vec=(vlist[(*f_it)[0]]+vlist[(*f_it)[1]]+vlist[(*f_it)[2]])/3;
		uvec=vec/vec.abs();
		
		if((uvec%pos)>max){
			candidate=vec;
			max=(uvec%pos);
		}
	}
	return candidate;
}
inline vector3 GravitationalField::getTriangleCenter(vector3 pos,vector3 *nvec){
	vector3 candidate,vec,uvec;
	
	pos/=pos.abs();
	
	double max=-1;
	std::vector<std::vector<int> >::iterator f_it,candidate_it;
	for (f_it=plist.begin(); f_it!=plist.end(); f_it++) {
		vec=(vlist[(*f_it)[0]]+vlist[(*f_it)[1]]+vlist[(*f_it)[2]])/3;
		uvec=vec/vec.abs();
		
		if((uvec%pos)>max){
			candidate=vec;
			candidate_it=f_it;
			max=(uvec%pos);
		}
	}
	
	*nvec=(vlist[(*candidate_it)[1]]-vlist[(*candidate_it)[0]])*(vlist[(*candidate_it)[2]]-vlist[(*candidate_it)[0]]);
	
	return candidate;
}
inline bool GravitationalField::getPolygonIntersection(vector3 pos,vector3* vec,vector3* nvec){
	vector3 v_tmp,n_tmp;
	
	pos/=pos.abs();
	
	std::vector<std::vector<int> >::iterator f_it;
	for (f_it=plist.begin(); f_it!=plist.end(); f_it++) {
		if(TriangleIntersect(vector3(0.0,0.0,0.0),pos,vlist[(*f_it)[0]],vlist[(*f_it)[1]],vlist[(*f_it)[2]],&v_tmp)==true && v_tmp%pos>0){
			*vec=v_tmp;
			n_tmp=(vlist[(*f_it)[1]]-vlist[(*f_it)[0]])*(vlist[(*f_it)[2]]-vlist[(*f_it)[0]]);
			*nvec=n_tmp/n_tmp.abs();
			return true;
		}
	}
	
	return false;
	
}
inline bool GravitationalField::TriangleIntersect(vector3 Orig,vector3 dir,vector3 v0,vector3 v1,vector3 v2,vector3* vec){
	vector3 e1,e2,pvec,tvec,qvec;
	double det,t,u,v;
	
	e1=v1-v0;
	e2=v2-v0;
	
	dir/=dir.abs();
	
	pvec=dir*e2;
	det=e1%pvec;
	
	if(det > (1e-3)){
		tvec=Orig-v0;
		u=tvec%pvec;
		if(u < 0.0 || u > det)return false;
		
		qvec=tvec*e1;
		v=dir%qvec;
		if(v < 0.0 || u+v > det)return false;
	}else if(det < -(1e-3)){
		tvec=Orig-v0;
		u=tvec%pvec;
		if(u > 0.0 || u < det)return false;
		
		qvec=tvec*e1;
		v=dir%qvec;
		if(v > 0.0 || u+v < det)return false;
	}else{
		return false;
	}
	
	t=e2%qvec;
	t*=1.0/det;

	*vec=t*dir+Orig;
	
	return true;
}

inline vector3 GravitationalField::getCenterOfGravity(){
	return centerOfGravity;
}

#endif
