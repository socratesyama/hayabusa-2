KPL/FK

Hayabusa2 Frames Definition Kernel (Additional)
===========================================================================

   This frame kernel contains a set of frame definitions for the 
   Hayabusa2 mission. Frame definitions relating the Hayabusa2 
   home position frame are included in this kernel.

Version and Date
---------------------------------------------------------------------------
   Version 0.1 -- Dec. 07, 2016 -- Naru HIRATA, Univ. of Aizu


Hayabusa Reference Frames
---------------------------------------------------------------------------

   The following reference frames for Hayabusa2 spacecraft, its
   structures, and science instruments are defined in this FK and other
   Hayabusa2 kernels (Ryugu FK, PCKs, and IKs):


   Ryugu body-fixed frame (defined in a separate FK and PCKs):
   -------------------------------------------------------------

      Name                    Relative to            Type           Frame ID
      ======================  =====================  ============   ========
      RYUGU_FIXED             J2000                  PCK             2162173


   Hayabusa2-specific dynamic frames:
   ---------------------------------

      Name                    Relative to            Type           Frame ID
      ======================  =====================  ============   ========
      HYB2_HP_FRAME           J2000                  DYNAMIC          -37900
      RYUGU_-Z_SUN_+X         J2000                  DYNAMIC          -37910
      EARTH_RYUGU_P           J2000                  DYNAMIC          -37920
   

Hayabusa2 Reference Frame Tree
---------------------------------------------------------------------------


   This diagram shows the Hayabusa2 frame tree:


                               "J2000" INERTIAL
         +-----------------------------------------------------------+
         |                   |         |         |                   |
         |<-dynamic          |         |         |          dynamic->|
         |                   |         |         |                   |
         V                   |         |         |                   V
      "HYB2_HP_FRAME"        |         |         |         "RYUGU_-Z_SUN_+X"
    -------------------      |         |         |        -------------------
                             |         |         |
                             |         |         |
                    dynamic->|         |         |<-pck
                             |         |         |
                             V         |         V
                  "EARTH_RYUGU_P"      |    "RYUGU_FIXED"
                 -----------------     |   ---------------
                                       |
                                       |
                                       |<-ck
                                       |
                                       V
                           "HAYABUSA2_SC_BUS_PRIME"

Hayabusa2-Specific Dynamic Frames
---------------------------------------------------------------------------

   The HYB2_HP_FRAME frame, used as the reference frame in the
   Hayabusa2 SPKs produces by JAXA, is defined as follows:

      - +Z axis is along the geometric direction from Ryugu to the
        Earth

      - +X axis is as close as possible to the geometric direction 
        from Ryugu to the Sun

      - +Y axis completes the right-handed frame;

   This frame is defined as a two-vector style dynamic frame below.
   
      \begindata

         FRAME_HYB2_HP_FRAME         = -37900
         FRAME_-37900_NAME           = 'HYB2_HP_FRAME'
         FRAME_-37900_CLASS          = 5
         FRAME_-37900_CLASS_ID       = -37900
         FRAME_-37900_CENTER         = 2162173
         FRAME_-37900_RELATIVE       = 'J2000'
         FRAME_-37900_DEF_STYLE      = 'PARAMETERIZED'
         FRAME_-37900_FAMILY         = 'TWO-VECTOR'
         FRAME_-37900_PRI_AXIS       = 'Z'
         FRAME_-37900_PRI_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37900_PRI_OBSERVER   = 2162173
         FRAME_-37900_PRI_TARGET     = 'EARTH'
         FRAME_-37900_PRI_ABCORR     = 'NONE'
         FRAME_-37900_SEC_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37900_SEC_OBSERVER   = 2162173
         FRAME_-37900_SEC_TARGET     = 'SUN'
         FRAME_-37900_SEC_AXIS       = 'X'
         FRAME_-37900_SEC_ABCORR     = 'NONE'

      \begintext


   The RYUGU_-Z_SUN_+X frame, representing the nominal Ryugu-pointed
   orientation, is defined as follows:

      - -Z axis is along the geometric direction from Hayabusa2 to
        Ryugu

      - +X axis is as close as possible to the geometric direction from
        Hayabusa2 to the Sun

      - +Y axis completes the right-handed frame;

   This frame is defined as a two-vector style dynamic frame below.

      \begindata

         FRAME_RYUGU_-Z_SUN_+X       = -37910
         FRAME_-37910_NAME           = 'RYUGU_-Z_SUN_+X'
         FRAME_-37910_CLASS          = 5
         FRAME_-37910_CLASS_ID       = -37910
         FRAME_-37910_CENTER         = -37
         FRAME_-37910_RELATIVE       = 'J2000'
         FRAME_-37910_DEF_STYLE      = 'PARAMETERIZED'
         FRAME_-37910_FAMILY         = 'TWO-VECTOR'
         FRAME_-37910_PRI_AXIS       = '-Z'
         FRAME_-37910_PRI_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37910_PRI_OBSERVER   = -37
         FRAME_-37910_PRI_TARGET     = 2162173
         FRAME_-37910_PRI_ABCORR     = 'NONE'
         FRAME_-37910_SEC_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37910_SEC_OBSERVER   = -37
         FRAME_-37910_SEC_TARGET     = 'SUN'
         FRAME_-37910_SEC_AXIS       = 'X'
         FRAME_-37910_SEC_ABCORR     = 'NONE'

      \begintext


   The EARTH_RYUGU_P frame, representing the nominal Earth-pointed
   by the High-gain antenna orientation, is defined as follows:

      - +Z axis is along the geometric direction from the Earth to
        Ryugu

      - +Y axis is as close as possible to the geometric direction from
        the Earth to the Sun

      - +X axis completes the right-handed frame;

   This frame is defined as a two-vector style dynamic frame below.

      \begindata

         FRAME_EARTH_RYUGU_P         = -37920
         FRAME_-37920_NAME           = 'EARTH_RYUGU_P'
         FRAME_-37920_CLASS          = 5
         FRAME_-37920_CLASS_ID       = -37920
         FRAME_-37920_CENTER         = 399
         FRAME_-37920_RELATIVE       = 'J2000'
         FRAME_-37920_DEF_STYLE      = 'PARAMETERIZED'
         FRAME_-37920_FAMILY         = 'TWO-VECTOR'
         FRAME_-37920_PRI_AXIS       = 'Z'
         FRAME_-37920_PRI_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37920_PRI_OBSERVER   = 'EARTH'
         FRAME_-37920_PRI_TARGET     = 2162173
         FRAME_-37920_PRI_ABCORR     = 'NONE'
         FRAME_-37920_SEC_VECTOR_DEF = 'OBSERVER_TARGET_POSITION'
         FRAME_-37920_SEC_OBSERVER   = 'EARTH'
         FRAME_-37920_SEC_TARGET     = 'SUN'
         FRAME_-37920_SEC_AXIS       = 'Y'
         FRAME_-37920_SEC_ABCORR     = 'NONE'

     \begintext


End of FK file.
