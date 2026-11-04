KPL/MK

   This meta-kernel lists the Hayabusa2 SPICE kernels providing coverage
   for 2018. All the kernels listed below are archived in the PDS
   Hayabusa2 SPICE kernel archive. This set of files and the order in
   which they are listed were picked to provide the best available data
   and the most complete coverage based on the information about the
   kernels available at the time this meta-kernel was made. For detailed
   information about the kernels listed below refer to the internal
   comments included in the kernels and the documentation accompanying
   the Hayabusa2 SPICE kernel archive.

   It is recommended that users make a local copy of this file and
   modify the value of the PATH_VALUES keyword to point to the actual
   location of the Hayabusa2 SPICE kernel archives' ``spice_kernels''
   directory on their system. Replacing ``/'' with ``\'' and converting
   line terminators to the format native to the user's system may also
   be required if this meta-kernel is to be used on a non-UNIX
   workstation.

   This file was created on February 17, 2025 by Shin-ya Murakami,
   ISAS/JAXA. The original name of this file was hyb2_2018_v02.tm.

\begindata

PATH_VALUES  = ( '..' )
PATH_SYMBOLS = ( 'K' )

KERNELS_TO_LOAD = (
  '$K/lsk/naif0012.tls'

  '$K/pck/pck00011.tpc'
  '$K/pck/ryugu_v10.tpc'

  '$K/sclk/hyb2_20210915_v01.tsc'

  '$K/ik/hyb2_lidar_v03.ti'
  '$K/ik/hyb2_nirs3_v03.ti'
  '$K/ik/hyb2_onc_v05.ti'
  '$K/ik/hyb2_tir_v04.ti'
  '$K/ik/hyb2_mascot_cam_v02.ti'
  '$K/ik/hyb2_mascot_mara_v02.ti'

  '$K/fk/hyb2_hp_v01.tf'
  '$K/fk/hyb2_v17.tf'
  '$K/fk/hyb2_ryugu_v01.tf'
  '$K/fk/hyb2_shape_v01.tf'
  '$K/fk/hyb2_mascot_v03.tf'

  '$K/spk/hyb2_de430_de440.bsp'
  '$K/spk/hyb2_jup329.bsp'
  '$K/spk/hyb2_mar097.bsp'
  '$K/spk/hyb2_struct_v01.bsp'
  '$K/spk/hyb2_hpk_20180627_20191119_v01.bsp'
  '$K/spk/hyb2_approach_od_v20180811114238.bsp'
  '$K/spk/hyb2_20141203-20180628_0001h_final_ver1.bsp'
  '$K/spk/lidar_derived_trj_20191114_no6dofc_v03.bsp'
  '$K/spk/2162173_ryugu_v02.bsp'
  '$K/spk/2162173_ryugu_approach_od_v01.bsp'
  '$K/spk/2162173_ryugu_20180601-20191230_0060_20181221.bsp'
  '$K/spk/hyb2_mascot_instruments_v02.bsp'
  '$K/spk/hyb2_mascot_ls_v01.bsp'
  '$K/spk/hyb2_mascot_lander_v02.bsp'

  '$K/ck/hyb2_2018_pred_v02.bc'
  '$K/ck/hyb2_hkattrpt_2018_v04.bc'
  '$K/ck/hyb2_aocsc_2018_v04.bc'
  '$K/ck/hyb2_mascot_lander_v01.bc'

  '$K/dsk/ryugu_shape_sfm_800k_v20200815.bds'
)

\begintext
