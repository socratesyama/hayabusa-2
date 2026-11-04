KPL/FK

Hayabusa2 Target Body DSK Surface ID Codes
========================================================================

   This kernel contains a set of Hayabusa2 Target Body DSK Surface ID
   Codes.


Version and Date
========================================================================

   Version 0.1 - November 13, 2023 - Shin-ya Murakami, ISAS/JAXA

      Initial version.


References
========================================================================

   1. ``Kernel Pool Required Reading''

   2. ``DS-Kernel Required Reading''



Contact Information
------------------------------------------------------------------------

  Shin-ya Murakami, murakami.shinya@jaxa.jp, ISAS/JAXA


Implementation Notes
========================================================================

   This file is used by the SPICE system as follows: programs that make
   use of this frame kernel must `load' the kernel, normally during
   program initialization. The SPICELIB routine FURNSH and CSPICE
   function furnsh_c load a kernel file into the kernel pool as shown
   below.

      CALL FURNSH ( 'frame_kernel_name' )
      furnsh_c    ( "frame_kernel_name" );

   This file was created and may be updated with a text editor or word
   processor.


Definition Section
========================================================================

   This section contains name to ID mappings for the Hayabusa2 target
   body DSK surfaces. These mappings are supported by all SPICE
   toolkits with integrated DSK capabilities (version N0066 or later).

   The IDs have the form PRRRRRVVV, where P is a 1 digit kind / producer
   / technique identifier (tru=1, spc=2, sfm=3), RRRRR is a 5 digit
   number of plates (03000, 00800, 00200, 00050, and 00049), VVV is
   a 3 digit version (010, 011, ...). Note that each producer may have
   models with the same version numbers.

   The 3 digit version numbers correspond to following version number
   based on date of creation of the model:

     3 digit ver.     version number
     ------------     --------------
     010              v20180628
     011              v20180630
     012              v20180705
     013              v20180710
     014              v20180714
     015              v20180717
     016              v20180719
     017              v20180719_2
     018              v20180725
     019              v20180725_2
     020              v20180727
     021              v20180731
     022              v20180804
     023              v20180805
     024              v20180805_2
     025              v20180810
     026              v20180816
     027              v20180829
     028              v20180904
     029              v20180910
     030              v20180918
     031              v20181014
     032              v20181109
     033              v20181204
     034              v20181214
     035              v20190129
     036              v20190130
     037              v20190308
     038              v20190328
     039              v20190418
     040              v20190428
     041              v20190505
     042              v20190802
     043              v20190910
     044              v20200323
     045              v20200815


   Asteroid (162173) Ryugu Surface name/IDs:

      DSK Surface Name                ID         Body ID
      =============================   =========  =======
      HYB2_RYUGU_3M_SFM_V20180804     303000022  2162173
      HYB2_RYUGU_800K_SFM_V20180804   300800022  2162173
      HYB2_RYUGU_200K_SFM_V20180804   300200022  2162173
      HYB2_RYUGU_49K_SFM_V20180804    300049022  2162173

      HYB2_RYUGU_3M_SPC_V20180829     203000027  2162173
      HYB2_RYUGU_800K_SPC_V20180829   200800027  2162173
      HYB2_RYUGU_200K_SPC_V20180829   200200027  2162173
      HYB2_RYUGU_49K_SPC_V20180829    200049027  2162173

      HYB2_RYUGU_3M_SPC_V20181109     203000032  2162173
      HYB2_RYUGU_800K_SPC_V20181109   200800032  2162173
      HYB2_RYUGU_200K_SPC_V20181109   200200032  2162173
      HYB2_RYUGU_49K_SPC_V20181109    200049032  2162173

      HYB2_RYUGU_3M_SPC_V20190802     203000042  2162173
      HYB2_RYUGU_800K_SPC_V20190802   200800042  2162173
      HYB2_RYUGU_200K_SPC_V20190802   200200042  2162173
      HYB2_RYUGU_49K_SPC_V20190802    200049042  2162173

      HYB2_RYUGU_3M_SPC_V20200323     203000044  2162173
      HYB2_RYUGU_800K_SPC_V20200323   200800044  2162173
      HYB2_RYUGU_200K_SPC_V20200323   200200044  2162173
      HYB2_RYUGU_49K_SPC_V20200323    200049044  2162173

      HYB2_RYUGU_3M_SFM_V20200815     303000045  2162173
      HYB2_RYUGU_800K_SFM_V20200815   300800045  2162173
      HYB2_RYUGU_200K_SFM_V20200815   300200045  2162173
      HYB2_RYUGU_50K_SFM_V20200815    300050045  2162173


   Name-ID Mapping keywords:

   \begindata

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SFM_V20180804'
      NAIF_SURFACE_CODE += 303000022
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SFM_V20180804'
      NAIF_SURFACE_CODE += 300800022
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SFM_V20180804'
      NAIF_SURFACE_CODE += 300200022
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_49K_SFM_V20180804'
      NAIF_SURFACE_CODE += 300049022
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SPC_V20180829'
      NAIF_SURFACE_CODE += 203000027
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SPC_V20180829'
      NAIF_SURFACE_CODE += 200800027
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SPC_V20180829'
      NAIF_SURFACE_CODE += 200200027
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_49K_SPC_V20180829'
      NAIF_SURFACE_CODE += 200049027
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SPC_V20181109'
      NAIF_SURFACE_CODE += 203000032
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SPC_V20181109'
      NAIF_SURFACE_CODE += 200800032
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SPC_V20181109'
      NAIF_SURFACE_CODE += 200200032
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_49K_SPC_V20181109'
      NAIF_SURFACE_CODE += 200049032
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SPC_V20190802'
      NAIF_SURFACE_CODE += 203000042
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SPC_V20190802'
      NAIF_SURFACE_CODE += 200800042
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SPC_V20190802'
      NAIF_SURFACE_CODE += 200200042
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_49K_SPC_V20190802'
      NAIF_SURFACE_CODE += 200049042
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SPC_V20200323'
      NAIF_SURFACE_CODE += 203000044
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SPC_V20200323'
      NAIF_SURFACE_CODE += 200800044
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SPC_V20200323'
      NAIF_SURFACE_CODE += 200200044
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_49K_SPC_V20200323'
      NAIF_SURFACE_CODE += 200049044
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_3M_SFM_V20200815'
      NAIF_SURFACE_CODE += 303000045
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_800K_SFM_V20200815'
      NAIF_SURFACE_CODE += 300800045
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_200K_SFM_V20200815'
      NAIF_SURFACE_CODE += 300200045
      NAIF_SURFACE_BODY += 2162173

      NAIF_SURFACE_NAME += 'HYB2_RYUGU_50K_SFM_V20200815'
      NAIF_SURFACE_CODE += 300050045
      NAIF_SURFACE_BODY += 2162173

   \begintext

End of FK.
