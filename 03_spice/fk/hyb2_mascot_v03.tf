KPL/FK

Hayabusa2 Mascot Lander Frames Kernel
========================================================================

Version and Date
----------------------------------------------------------------------

    Version 3.0 -- Tue Mar 11 2025 -- Shin-ya Murakami (JAXA)

      Removed the HAYABUSA2_MASCOT_MICROMEGA frame from the frame tree.

    Version 3.0b -- Fri Feb 14 2025 -- Shin-ya Murakami (JAXA)

      Added ASCII diagrams to the MASCOT frame definition.
      Updated the References section.
      Added Hayabusa2 Mascot Reference Frames section.

    Version 3.0a -- Fri Sep 20 2024 -- Shin-ya Murakami (JAXA)

      Updated definition of HAYABUSA2_MASCOT_TOPO.

    Version 2.0 -- Fri Dec 15 2023 -- Shin-ya Murakami (JAXA)
                                      and David Hercik (TU Braunschweig)

      Added definition and name-ID mapping for the MasMag frame.
      Updated the frame tree.
      Updated the Contact Information section.

    Version 1.0 -- Tue May 14 2019 -- Klaus-Dieter Matz (DLR)

      Initial Release.


Contact Information
----------------------------------------------------------------------

    If you have any questions regarding this file contact

        Thomas Roatsch (DLR)
        (+49) 30 67055 339

    or

        Shin-ya Murakami (JAXA)
        murakami.shinya@jaxa.jp


References
----------------------------------------------------------------------

   1. ``Frames Required Reading''

   2. Hayabusa2 Frames Kernel, Latest Version

   3. ``CAD drawings of the nominal position of MARA and Cam'',
      Email from M. Grott, August 10, 2016

   4. ``The MASCOT Radiometer MARA for the Hayabusa 2 Mission'',
      Grott, M., Knollenberg, J., Borgs, B. et al.
      Space Sci Rev (2017) 208: 413

   5. ``The Camera of the MASCOT Asteroid Lander on Board Hayabusa 2'',
      Jaumann, R., Schmitz, N., Koncz, A. et al.
      Space Sci Rev (2017) 208: 375.

   6. ``The Hayabusa2 lander MASCOT on the surface of asteroid (162173)
      Ryugu - Stereo-photogrammetric analysis of MASCam image data'',
      Scholten, F., Preusker, F., Elgner, S. et al.
      Astronomy and Astrophysics (2019) 632, L5.

   7. ``MASCOT -- The Mobile Asteroid Surface Scout Onboard the
      Hayabusa2 Mission'',
      Ho, T.-M., et al.
      Space Sci Rev (2017) 208, 339 - 374, doi:10.1007/s11214-016-0251-6


Hayabusa2-MASCOT NAIF IDs
----------------------------------------------------------------------

   The following names and NAIF ID codes are assigned to parts of
   the Hayabusa2 lander, MASCOT, its structures, and science instruments:

      NAME                                    NAIF ID
      -----------------------------------------------
      HAYABUSA2                                  -37

      HAYABUSA2_MASCOT                        -37700
      HAYABUSA2_MASCOT_TOPO                   -37701

      HAYABUSA2_MASCOT_CAM                    -37730
      HAYABUSA2_MASCOT_CAM_NONE               -37731
      HAYABUSA2_MASCOT_CAM_BLUE               -37732
      HAYABUSA2_MASCOT_CAM_GREEN              -37733
      HAYABUSA2_MASCOT_CAM_RED                -37734
      HAYABUSA2_MASCOT_CAM_NIR                -37735

      HAYABUSA2_MASCOT_MARA                   -37740
      HAYABUSA2_MASCOT_MARA_SILP              -37741
      HAYABUSA2_MASCOT_MARA_LP8               -37742
      HAYABUSA2_MASCOT_MARA_BP5               -37743
      HAYABUSA2_MASCOT_MARA_BP8               -37744
      HAYABUSA2_MASCOT_MARA_BP9               -37745
      HAYABUSA2_MASCOT_MARA_BP13              -37746

      HAYABUSA2_MASCOT_MICROMEGA              -37750

      HAYABUSA2_MASCOT_MASMAG                 -37760


   The keywords below implement the Hayabusa2-MASCOT name-ID mappings.

     \begindata

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_TOPO' )
         NAIF_BODY_CODE += ( -37701 )


         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM' )
         NAIF_BODY_CODE += ( -37730 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA' )
         NAIF_BODY_CODE += ( -37740 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MICROMEGA' )
         NAIF_BODY_CODE += ( -37750 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MASMAG' )
         NAIF_BODY_CODE += ( -37760 )


         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM_NONE' )
         NAIF_BODY_CODE += ( -37731 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM_BLUE' )
         NAIF_BODY_CODE += ( -37732 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM_GREEN' )
         NAIF_BODY_CODE += ( -37733 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM_RED' )
         NAIF_BODY_CODE += ( -37734)

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_CAM_NIR' )
         NAIF_BODY_CODE += ( -37735 )


         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_SILP' )
         NAIF_BODY_CODE += ( -37741 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_LP8' )
         NAIF_BODY_CODE += ( -37742 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_BP5' )
         NAIF_BODY_CODE += ( -37743 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_BP8' )
         NAIF_BODY_CODE += ( -37744 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_BP9' )
         NAIF_BODY_CODE += ( -37745 )

         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MARA_BP13' )
         NAIF_BODY_CODE += ( -37746 )


         NAIF_BODY_NAME += ( 'HAYABUSA2_MASCOT_MASMAG' )
         NAIF_BODY_CODE += ( -37760 )

      \begintext


Hayabusa2 Mascot Frames
========================================================================

   This section of the file contains the definitions of the Mascot
   topocentric, lander and instrument frames.


Hayabusa2 Mascot Reference Frames
---------------------------------------------------------------------------

   The following reference frames for the Hayabusa2 Mascot lander, its
   structures, and science instruments are defined in this FK:


   Hayabusa2 Target frames (defined in separate FK file):
   ------------------------------------------------------------------------

      Name                       Relative to              Type     Frame ID
      =========================  =======================  =======  ========
      RYUGU_FIXED                J2000                    PCK       2162173


   Hayabusa2 Mascot Topographic frame:
   ------------------------------------------------------------------------

      Name                        Relative to             Type     Frame ID
      ==========================  ======================  =======  ========
      HAYABUSA2_MASCOT_TOPO       RYUGU_FIXED             FIXED      -37701


   Hayabusa2 Mascot lander frame:
   ------------------------------------------------------------------------

      Name                       Relative to              Type     Frame ID
      =========================  =======================  =======  ========
      HAYABUSA2_MASCOT           RYUGU_FIXED              CK         -37700


   Hayabusa2 Mascot Science Instrument frames:
   ------------------------------------------------------------------------

      Name                        Relative to             Type     Frame ID
      ==========================  ======================  =======  ========
      HAYABUSA2_MASCOT_CAM        HAYABUSA2_MASCOT        FIXED      -37730
      HAYABUSA2_MASCOT_MARA       HAYABUSA2_MASCOT        FIXED      -37740
      HAYABUSA2_MASCOT_MASMAG     HAYABUSA2_MASCOT        FIXED      -37760


Hayabusa2 Mascot Frame Tree
--------------------------------------

   The diagram below shows the Hayabusa2 Mascot instrument frame
   hierarchy.


                          "J2000" INERTIAL
           +----------------------------------------------------+
           |                     |                              |
           |<-ck                 |                              |<-pck
           |                     |                              |
           V                     |                              V
   "HAYABUSA2_SC_BUS_PRIME"      |                         "IAU_EARTH"
   ------------------------      |<-pck                  EARTH BODY-FIXED
                                 |                       ----------------
                                 V
                           "RYUGU_FIXED"
                           -----------------------+
                                 |                |
                                 |                |<-fixed
                                 |                |
                                 |                V
                                 |         "HAYABUSA2_MASCOT_TOPO"
                                 |         -----------------------
                                 |
                                 |
                                 |<-ck
                                 |
                                 V
                       "HAYABUSA2_MASCOT"
                +----------------------------------+
                |                |                 |
                |<-fixed         |<-fixed          |<-fixed
                |                |                 |
                V                |                 V
      "HAYABUSA2_MASCOT_CAM"     |       "HAYABUSA2_MASCOT_MASMAG"
      ----------------------     |       -------------------------
                                 V
                       "HAYABUSA2_MASCOT_MARA"
                       -----------------------



Hayabusa2 Mascot Topocentric Frame
----------------------------------

   This frame defines the z axis as the normal outward at the landing
   site, it is tilted 15 degrees southward against the local radius vector.
   The x axis points at local east, the y axis completing the right handed
   frame by pointing to the local north.

   Orientation of the frame is given relative to the body fixed rotating
   frame 'RYUGU_FIXED' (x - along the line of zero longitude intersecting
   the equator, z - along the spin axis, y - completing the right hand
   coordinate frame.)

   The landing site coordinates longitude and latitude upon which the
   definition is built are:

      Longitude = 317.1610 degrees East
      Latitude  = -22.2940 degrees North
      Radius    = 446.250  m

   where these values are position at MP4 taken from Table 3 in [6].


   \begindata

      FRAME_HAYABUSA2_MASCOT_TOPO     =  -37701
      FRAME_-37701_NAME               = 'HAYABUSA2_MASCOT_TOPO'
      FRAME_-37701_CLASS              =  4
      FRAME_-37701_CLASS_ID           =  -37701
      FRAME_-37701_CENTER             =  -37701

      TKFRAME_-37701_RELATIVE         = 'RYUGU_FIXED'
      TKFRAME_-37701_SPEC             = 'ANGLES'
      TKFRAME_-37701_UNITS            = 'DEGREES'
      TKFRAME_-37701_AXES             = ( 3, 2, 3 )
      TKFRAME_-37701_ANGLES           = ( -317.1610, -127.2940, -90.000  )

   \begintext



Hayabusa2 Mascot Frame
----------------------------------------------------------------------

   The lander frame -- HAYABUSA2_MASCOT -- is defined by the lander design as
   follows:

      -  +Z axis is perpendicular to the lander baseplate and points
         from the lander baseplate towards the lander top plate;

      -  +Y axis is parallel to the lander baseplate and points from
         the lander backside toward the imaging instrument side;

      -  +X axis completes the right handed frame;

      -  the origin of the frame is in the center of the baseplate inner
         surface.


   Following diagrams illustrate the lander frame drawn from Fig. 3 in [4]:

   +Z view:
   --------

         +---------------------------------------------+
         |  .---------------------------------------.  |
         | |                   ___ MESS antenna      | |
         | |                 /'   `\                 | |
         | |                .       .                | |
         | |                |       |                | |
         | |                 \     / Sub-Radiator    | |
         | .                  `---'                  . |
         |  `---------------------------------------'  |
         |                                             |
         |                      +Z                     |
         +------------------<---o----------------------+
         |                 +X   |                      |
         |                      V +Y                   |
         |                                             |
         |              Radiator (Top Plate)           |
         |                                             |
         |                                             |
         |                                             |
         +---------------------------------------------+


    +Y view:
    --------

         +---------------------------------------------+
         |``              |  ____       |     MASCAM.//|
         | ``.            | |----| MARA |         .//' |
         |   ``           | `----'      |       .//'   |
         |    ``.         |             |     .//'     |
         |      ``        |             |   .//'       |
         |       ``.      |             | .//'         |
         |         ``.    |             .//'           |
         |          ``    |           .//'             |
         |-----------``.--+         .//'+--------------|
         |            ``.         .//'  |              |
         |              |``     .//'    |              |
         |              |``   .//'      |              |
         |MicrOmega     | ``. //^       |              |
         |              |  `.//'|+Z     |       MASMAG |
         +------------------<---o----------------------+
                           +X   +Y


    +X view:
    --------

         +---------------------------++----------------+
         |``.                   |    ||              //|
         |  ``.   Battery       |    ||             // |
         |    ``.               |    ||            //  |
         | +--- ``.------------+     ||           //   |
         | |      ``.          |     ||          //    |
         | |        ``.        |     ||         //     |
         | |          ``.      |     ||        //      |
         | |            ``.    |     ||       //       |
         | |              ``.  |     ||      //        |
         | |                ``.|     ||     //         |
         | |                  ``.    ||    //          |
         | |                   |``.  ||   //  MicrOmega|
         | |                   |  ``.||  //            |
         | | E-Box            +Z^  ``|| //             |
         | |___________________||   `||//              |
         +----------------------o-->-++----------------+
                              +X   +Y

   \begindata

      FRAME_HAYABUSA2_MASCOT          =  -37700
      FRAME_-37700_NAME               = 'HAYABUSA2_MASCOT'
      FRAME_-37700_CLASS              =  3
      FRAME_-37700_CLASS_ID           =  -37700
      FRAME_-37700_CENTER             =  -37700

      CK_-37700_SCLK                  = -37
      CK_-37700_SPK                   = -37700

   \begintext



Hayabusa2 Mascot Instrument frames
----------------------------------------------------------------------


CAM, Mascot Camera frame
------------------------

    Boresight vector calculated from [5], pg. 17, Fig. 11:
        [0.0, 0.92718387, -0.37460661],
    defined in the lander frame HAYABUSA2_MASCOT.

    The angle between +Z_mascot and this boresight vector is 112.0 degrees,
    the axis of this rotation is parallel to the the +X_mascot axis.

    Using this value we define the Mascot Camera frame as follows:

       -  +Z axis is parallel to the boresight vector defined above,
          i.e. we have to rotate the +Z_mascot axis by -112.0 degrees
          about the +X axis to get the +Z_mascam axis.

       -  +X axis is parallel to the HAYABUSA2_MASCOT +X axis;

       -  +Y axis completes the right handed frame;

       - the origin of the frame is in the center of the entry pupil
         of the Camera (see [3], slide 3)


   Following diagram illustrates the CAM frame with respect to the Mascot
   frame.

    +X view:
    --------

                   ^ +Zmascot
                   |
                   |
                   |
    +Xcam and      |-._ 112 deg
    +Xmascot       |   \
    are the out    |    |  +Ymascot
    of the page.   o----/---->
                  / ``--..__
                 .'         ``--..__
                /                   ``--> +Zcam
               .'
              /
             V +Ycam


   \begindata

      FRAME_HAYABUSA2_MASCOT_CAM      = -37730
      FRAME_-37730_NAME               = 'HAYABUSA2_MASCOT_CAM'
      FRAME_-37730_CLASS              = 4
      FRAME_-37730_CLASS_ID           = -37730
      FRAME_-37730_CENTER             = -37730
      TKFRAME_-37730_SPEC             = 'ANGLES'
      TKFRAME_-37730_RELATIVE         = 'HAYABUSA2_MASCOT'
      TKFRAME_-37730_AXES             = (   3,     2,      1 )
      TKFRAME_-37730_UNITS            = 'DEGREES'
      TKFRAME_-37730_ANGLES           = ( 0.0, 0.0, 112.0 )

   \begintext


MARA, Mascot Radiometer Frame
-----------------------------

    Values from [3] and [4]:

    "The boresight vector is the same for all MARA sensors:
        [-1.3, 18.2, -15.3]",
    defined in the lander frame HAYABUSA2_MASCOT.

    The angle between +Z_mascot and this boresight vector is 129.98060 degrees,
    the angle between the axis of this rotation (i.e. the cross product of
    +Z_mascot and the boresight vector) and the +X_mascot axis is
    175.91437 degrees.


    Using this value we define the Mascot Radiometer Frame as follows:

       -  +Z axis is parallel to the boresight vector defined above,

       -  +Y axis lies in the plane spanned by the +Z axis of MARA and
          the +Z axis of HAYABUSA2_MASCOT and points roughly in the
          direction of +Z axis of HAYABUSA2_MASCOT.

       -  +X axis completes the right handed frame;

       - the origin of the frame is the origin of the MARA instrument


   Following diagram illustrates the Radiometer frame with respect to the
   Mascot frame.


    +X view:
    --------

           +Zmascot ^   __. +Ymara
                    |    /|
    -Xmara and      |   /
    +Xmascot is     |  /
    out of the page |-\ 129.98060 degree
                    |/ | 
                    o--/------> +Ymascot
                     \.
                       \.
                         \.
                           \.
                             \l
                            --' +Zmara
 


   \begindata

      FRAME_HAYABUSA2_MASCOT_MARA     = -37740
      FRAME_-37740_NAME               = 'HAYABUSA2_MASCOT_MARA'
      FRAME_-37740_CLASS              = 4
      FRAME_-37740_CLASS_ID           = -37740
      FRAME_-37740_CENTER             = -37740
      TKFRAME_-37740_SPEC             = 'ANGLES'
      TKFRAME_-37740_RELATIVE         = 'HAYABUSA2_MASCOT'
      TKFRAME_-37740_AXES             = (   3,     2,      1 )
      TKFRAME_-37740_UNITS            = 'DEGREES'
      TKFRAME_-37740_ANGLES           = ( 175.91437,  0.000, -129.98060)

   \begintext


MASMAG, Mascot Magnetometer frame
---------------------------------

    We define the Mascot Magnetometer frame as follows:

       -  +Z axis is parallel to the HAYABUSA2_MASCOT -Z axis;

       -  +Y axis is parallel to the HAYABUSA2_MASCOT -X axis;

       -  +X axis is parallel to the HAYABUSA2_MASCOT -Y axis;

       - the origin of the frame is in the center of the sensor head
         cylinder, located at:

           HAYABUSA2_MASCOT_MASMAG_XYZ = (-0.000085, 0.0001, 0.00004)

         in km with respect to the center of the HAYABUSA2_MASCOT frame.


   Following diagram illustrates the MASMAG frame with respect to the
   Mascot frame.


    +X view:
    --------

                   ^ +Zmascot
                   |
    +Ymag and      |
    -Xmascot is    |
    into the page  |
                   |       +Ymascot
         <---------x--------->
       +Xmag       |
                   |
                   |
                   |
                   |
                   V +Zmag


   \begindata

      FRAME_HAYABUSA2_MASCOT_MASMAG   = -37760
      FRAME_-37760_NAME               = 'HAYABUSA2_MASCOT_MASMAG'
      FRAME_-37760_CLASS              = 4
      FRAME_-37760_CLASS_ID           = -37760
      FRAME_-37760_CENTER             = -37760
      TKFRAME_-37760_SPEC             = 'MATRIX'
      TKFRAME_-37760_RELATIVE         = 'HAYABUSA2_MASCOT'
      TKFRAME_-37760_MATRIX           = (  0   -1    0
                                          -1    0    0
                                           0    0   -1   )

   \begintext

