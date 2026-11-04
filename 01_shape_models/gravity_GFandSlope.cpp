/*
 *  GFTest.cpp
 *  EDS
 *
 *  Created by m5151126 on 11/11/11.
 *  Last modified by Naru Hirata on 19/02/20
 *  Copyright 2011, 2019 University of Aizu. All rights reserved.
 *
 */

#define POLYGON_SCALE (1000)

#include <iostream>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <iomanip>
#include "vector3.h"
#include "GF.h"
#include "SpiceUsr.h"

int main(int argc, char* argv[]){
  
  SpiceDouble vnorm_s[3], vattract_s[3], vcenter_s[3];
  SpiceDouble slope, lat, lon, radius;
  SpiceDouble centRefugalAcc[3];
  SpiceDouble omega[3];
  SpiceDouble vcenter_s_si[3];
  SpiceDouble temp[3];
  SpiceDouble vertex1[3],vertex2[3],vertex3[3];
  SpiceDouble vtmp[3];
  
  double PERIOD;
  double DENSITY;
  SpiceInt START_POLYGON;
  SpiceInt END_POLYGON;
  
  std::cerr<<argc<<std::endl;;
  if (!(argc == 6) && !(argc == 4) ) {
    std::cerr<<"Usage: ";
    std::cerr<<argv[0];
    std::cerr<<" POLYGON_DAT_FILE ";
    std::cerr<<"PERIOD_h ";
    std::cerr<<"DENSITY_SI_unit ";
    std::cerr<<"[START_POLYGON ";
    std::cerr<<"END_POLYGON]";
    std::cerr<<std::endl;
    exit(1);
  }
  
  PERIOD = atof(argv[2]);
  DENSITY = atof(argv[3]);
  if(argc == 6) {
    START_POLYGON = atoi(argv[4]);
    END_POLYGON = atoi(argv[5]);
  } else {
    START_POLYGON = 1;  
    END_POLYGON = 0;  
  }
  std::cerr<<"PERIOD: ";
  std::cerr<<PERIOD<<std::endl;
  std::cerr<<"DENSITY: ";
  std::cerr<<DENSITY<<std::endl;
  std::cerr<<"START_POLYGON: ";
  std::cerr<<START_POLYGON<<std::endl;
  std::cerr<<"END_POLYGON: ";
  std::cerr<<END_POLYGON<<std::endl;
  
  omega[0] = omega[1] = 0;
  omega[2] = 2*pi_c() / (PERIOD * 60 *60);

  std::string filename(argv[1]);
  GravitationalField* gf=new GravitationalField(filename,POLYGON_SCALE,(6.67259e-11),DENSITY);
  FILE* fp;
  fp=fopen(filename.c_str(),"r");
  std::vector<vector3> v_list;
  int vnum;
  fscanf(fp,"%d",&vnum);
  std::cerr<<"vnum:"<<vnum<<std::endl;
  for(int i=0;i<vnum;i++){
    vector3 tmp;
    int idx;
    fscanf(fp,"%d",&idx);
    fscanf(fp,"%lf",&(tmp.x));
    fscanf(fp,"%lf",&(tmp.y));
    fscanf(fp,"%lf",&(tmp.z));
    
    v_list.push_back(tmp);
    }

  int pnum;
  fscanf(fp,"%d",&pnum);
  std::cerr<<"pnum:"<<pnum<<std::endl;
  
  if ( START_POLYGON == 1) {
    std::cout<<"#Data: ";
    std::cout<<argv[1];
    std::cout<<std::endl;
    std::cout<<"#Number of Polygons: ";
    std::cout<<pnum;
    std::cout<<std::endl;
    std::cout<<"#Rotational Period: ";
    std::cout<<PERIOD;
    std::cout<<" [h] ";
    std::cout<<", Density: ";
    std::cout<<DENSITY;
    std::cout<<" [kg/m^3] ";
    std::cout<<std::endl;
    std::cout<<"#Unit: Polygon center coordinate in km, and SI units for other values.";
    std::cout<<pnum;
    std::cout<<std::endl;
  
    std::cout<<std::setw(10)<<"#PlateID  ";
    std::right;
    std::cout<<std::setprecision(4);
    std::cout<<std::setw(10)<<"center_x   ";
    std::cout<<std::setw(10)<<"center_y   ";
    std::cout<<std::setw(10)<<"center_z   ";
    std::cout<<std::setw(6)<<"lon    ";
    std::cout<<std::setw(6)<<"lat    ";
    std::cout<<std::setw(10)<<"GravAcc_x  ";
    std::cout<<std::setw(10)<<"GravAcc_y  ";
    std::cout<<std::setw(10)<<"GravAcc_z  ";
    std::cout<<std::setw(10)<<"CRefAccx   ";
    std::cout<<std::setw(10)<<"CRefAccy   ";
    std::cout<<std::setw(10)<<"CRefAccz   ";
    std::cout<<std::setw(10)<<"attract_x  ";
    std::cout<<std::setw(10)<<"attract_y  ";
    std::cout<<std::setw(10)<<"attract_z  ";
    std::cout<<std::setw(10)<<"Gpotential ";
    std::cout<<std::setw(10)<<"Rpotential ";
    std::cout<<std::setw(10)<<"Tpotential ";
    std::cout<<std::setw(15)<<"GeopotentialSlope ";
    std::cout<<std::setw(12)<<"normal_x   ";
    std::cout<<std::setw(12)<<"normal_y   ";
    std::cout<<std::setw(12)<<"normal_z   ";
    std::cout<<std::setw(6)<<"area   ";
    std::cout<<std::endl;
  }

  char    buf[256];
  for(int i=0; i < START_POLYGON;i++){
    fgets(buf, sizeof(buf),fp);
  }

  if (END_POLYGON == 0) END_POLYGON = pnum;

  for(int i=(START_POLYGON - 1); i < END_POLYGON;i++){
    vector3 center;
    vector3 v1,v2,v3;
    vector3 attract;
    vector3 nvec;
    double lap;
    int idx;
    int idx1,idx2,idx3;
    double edge1,edge2,edge3,peri;
    double area;
    
    double g_potential, r_potential;
    
    fscanf(fp,"%d",&idx);
    fscanf(fp,"%d",&idx1);
    fscanf(fp,"%d",&idx2);
    fscanf(fp,"%d",&idx3);
    
    center=(v_list[idx1-1]+v_list[idx2-1]+v_list[idx3-1])/3*1000;
    
    v1=v_list[idx1-1];
    v2=v_list[idx2-1];
    v3=v_list[idx3-1];
    vertex1[0] = (SpiceDouble) v1.x;
    vertex1[1] = (SpiceDouble) v1.y;
    vertex1[2] = (SpiceDouble) v1.z;
    vertex2[0] = (SpiceDouble) v2.x;
    vertex2[1] = (SpiceDouble) v2.y;
    vertex2[2] = (SpiceDouble) v2.z;
    vertex3[0] = (SpiceDouble) v3.x;
    vertex3[1] = (SpiceDouble) v3.y;
    vertex3[2] = (SpiceDouble) v3.z;
    vsub_c(vertex1,vertex2,vtmp);
    edge1=(double)vnorm_c(vtmp);
    vsub_c(vertex2,vertex3,vtmp);
    edge2=(double)vnorm_c(vtmp);
    vsub_c(vertex1,vertex3,vtmp);
    edge3=(double)vnorm_c(vtmp);
    peri = (edge1 + edge2 + edge3)/2.0;
    area=sqrt(peri*(peri-edge1)*(peri-edge2)*(peri-edge3));
    
    g_potential = gf->getGravitationAtPoint(center,&attract,&lap);
    gf->getTriangleCenter(center, &nvec);
    
    //SpiceDouble vnorm_s[3], vattract_s[3], vcenter_s[3];
    //SpiceDouble slope;
    vcenter_s[0] = (SpiceDouble) center.x;
    vcenter_s[1] = (SpiceDouble) center.y;
    vcenter_s[2] = (SpiceDouble) center.z;
    vattract_s[0] = (SpiceDouble) attract.x;
    vattract_s[1] = (SpiceDouble) attract.y;
    vattract_s[2] = (SpiceDouble) attract.z;
    vnorm_s[0] = (SpiceDouble) nvec.x;
    vnorm_s[1] = (SpiceDouble) nvec.y;
    vnorm_s[2] = (SpiceDouble) nvec.z;
    
    vcrss_c(omega, vcenter_s, temp);
    vcrss_c(omega, temp, centRefugalAcc);
    vminus_c(centRefugalAcc, centRefugalAcc);
    
    reclat_c ( vcenter_s, &radius, &lon, &lat );
    if (lon < 0) lon = pi_c() * 2.0 + lon;
    
    std::cerr<<"\r";
    std::cerr<<i+1;

    std::cout<<std::setw(12)<<i+1<<" ";
    std::right;
    std::cout<<std::setprecision(4);
    std::cout<<std::setw(10)<<center.x/1000<<" ";
    std::cout<<std::setw(10)<<center.y/1000<<" ";
    std::cout<<std::setw(10)<<center.z/1000<<" ";
    std::cout<<std::setw(6)<<lon*dpr_c()<<" ";
    std::cout<<std::setw(6)<<lat*dpr_c()<<" ";
    std::cout<<std::setw(10)<<attract.x<<" ";
    std::cout<<std::setw(10)<<attract.y<<" ";
    std::cout<<std::setw(10)<<attract.z<<" ";
    std::cout<<std::setw(10)<<centRefugalAcc[0]<<" ";
    std::cout<<std::setw(10)<<centRefugalAcc[1]<<" ";
    std::cout<<std::setw(10)<<centRefugalAcc[2]<<" ";

    vadd_c(vattract_s, centRefugalAcc, vattract_s);

    std::cout<<std::setw(10)<<vattract_s[0]<<" ";
    std::cout<<std::setw(10)<<vattract_s[1]<<" ";
    std::cout<<std::setw(10)<<vattract_s[2]<<" ";
    
    r_potential = 0.5 * vnorm_c(omega) * vnorm_c(omega) * (center.x*center.x+center.y*center.y);
    
    std::cout<<std::setw(10)<<g_potential<<" ";
    std::cout<<std::setw(10)<<r_potential<<" ";
    std::cout<<std::setw(10)<<(-1*g_potential-r_potential)<<" ";

    vminus_c(vattract_s, vattract_s);
    slope = vsep_c(vattract_s, vnorm_s);

    std::cout<<std::setw(6)<<slope*dpr_c();
    std::cout<<std::setw(12)<<nvec.x<<" ";
    std::cout<<std::setw(12)<<nvec.y<<" ";
    std::cout<<std::setw(12)<<nvec.z<<" ";
    std::cout<<std::setw(6)<<area<<" ";
    std::cout<<std::endl;
	}
	
	
	fclose(fp);
	
	std::cerr<<"Finish!"<<std::endl;
	return 0;
	
}
