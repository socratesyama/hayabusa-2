KPL/FK

Hayabusa2 Frame Kernel for Asteroid (162173) Ryugu
===========================================================================


Release note
--------------------------------------------------------

     Version 0.1   -- May 18, 2017 -- Yoshiaki Ishihara
                                        and Yukio Yamamoto, ISAS/JAXA
        Split the FK and PCK contents into two kernels respectively


     Version 0.0a  -- June 16, 2016 -- Manabu YAMADA, PERC/Chitech
        Added the Ryugu name-ID mapping


     Version 0.0   -- June 16, 2016 -- Yoshiaki Ishihara
                                         and Yukio Yamamoto, ISAS/JAXA
        Draft version by ground observation (As of Sep.22,2014)


RYUGU_FIXED Frame Definition
--------------------------------------------------------

     The Ryugu fixed frame is defined in the same way as any other PCK
     frame:

        *  +Z along the North pole;

        *  +X toward the prime meridian;

        *  +Y completes the right hand frame;

        *  the origin of this frame is at the center of the body.

     The orientation of this frame is computed by evaluating the
     corresponding rotation constants provided in separate PCK file.

     \begindata

        FRAME_RYUGU_FIXED      =  2162173
        FRAME_2162173_NAME     = 'RYUGU_FIXED'
        FRAME_2162173_CLASS    =  2
        FRAME_2162173_CLASS_ID =  2162173
        FRAME_2162173_CENTER   =  2162173

        OBJECT_2162173_FRAME   = 'RYUGU_FIXED'

     \begintext

End of FK.
