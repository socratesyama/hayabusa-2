HAYABUSA2 Optical Navigation Camera (ONC)  provisional Product Data Set, Version 03c (released on Oct. 1, 2021)
          JAXA,  Hayabusa2 ONC teams

--- Contents and Release Dates---
 
 Version 03c (Sep. 28, 2021) 
 
 Raw and calibrated images (l2a, l2b and l2c) of Hayabusa2 ONCs obtained from the launch (Dec, 2014) to the departure from Ryugu (Nov, 2019) are released. The backplane data (l2dpc, only latitude and longitude are included) is also included for the images in the proximity phase.
 For selection of data set, please refer Eventlist.txt in the top directory.
 
--- Important Notice on the Use of the Data---

Please note that this data set is in provisional format and will be replaced with new data in the PDS4 format soon. However latest calibration data in "Kouyama et al.(2021)", "Kameda et al.(2021)" and "Tatsumi et al.(2020)" are used in this product, except for the radiator stray light and hot pixel correction in "Tatsumi et al.(2019)". The quality is better than in "Sugita et al.(2019)"[5], "Watanabe et al.(2019)", and "Kitazato et al. (2019)". If you consider to publish your paper using this product, please cite "Sugita et al (2019)"[5] and this web site such as "http://darts.isas.jaxa.jp/pub/hayabusa2/onc_bundle", and other papers in "Reference" section below if necessary.

--- Instrument Overview---

The optical navigation camera (ONC) system onboard the Hayabusa2 spacecraft consists of one telescopic camera (T) and two wide-angle cameras (W1 and W2). The ONC-T is a telescopic camera with seven band-pass filters in the visible and near-infrared range. These filters are placed on a wheel, which rotates to put a selected filter for different observations, enabling multi-band imaging. For details on preflight and onboard calibration, please see the "Reference" section.

---Definition of Product Level (updated on Nov. 19, 2019)---

 Level	Data Description	Unit
   l2a	 Raw images in FITS format (16-bit integer)	DN
   l2b 	Images after hardware correction and radiometric correction in FITS format (32-bit float)	DN/s
   l2c	 Distortion corrected irradiance images in FITS format (32-bit float)	W/m^2/um/str
   l2d 	I/F (or radiance factor) images in FITS format (32-bit float)	non-dimensional(I/F)
   l2e	 Photometrically corrected reflectance images in FITS format (32-bit float) (in preparation)	non-dimensional(reflectance)
   l3	Mosaicked global I/F or reflectance images in FITS format (32-bit float) (in preparation)	non-dimensional(I/F or reflectance)

---File Naming Convention ---

hyb2_onc_yymmdd_hhmmss_CBT_ldx(x).fit
   Symbols	Meaning
   yymmdd_hhmmss	Exposure start time in UTC.
   CB	 Camera type
                   {w1, w2, t+band{u:ul, i:WIDE, v:v, w:w, x:x, n:Na, p:p, b:b }}
   T	Image Type
                    {f:mainframe(1024x1024), b:optical black(16x1024x2(on both sides))
   ldx(x)	Product level. e.g., l2a, l2b.

Additional character describes minor version of the product such as l2dr, indicating l2d coregistrated among bands).

---Imaging Condition ---

The details of the imaging condition are described in FITS header of each image file or an extracted FITS header in text format.

---Data Processing Tools ---

Visualization: Please use visualization tools supporting FITS format, such as SAOImageDS9 or GIMP
Analysis: Please use libraries supporting FITS format operations as listed below.
C: CFITSIO, SFITSIO
Python: astropy.io.fits

---Calibration ---

Please see papers in "Reference" section. Flat fields is in calibration data directory .

---Definition of Mission Phases ---

Name of mission phase	Period
EDVEGA (Electric Delta-V Earth Gravity Assist).
    From launch until Earth swing-by.	Dec. 3, 2014 - Dec. 3, 2015
Transfer	Dec. 3, 2015 - June, 2018
 Approach	June, 2018 - June 28, 2018
Proximity	June 28, 2018 - Nov. 13, 2019
Return	Nov. 13, 2019 - Oct. 21, 2020
Reentry	Oct. 22, 2020 - Dec. 5, 2020

References---

On the detectability of hydrous minerals on Ryugu using ONC-T:
[1] Kameda, S. et al. (2015), Detectability of hydrous minerals using ONC-T camera onboard the Hayabusa2 spacecraft, Advances in Space Research, Volume 56, Issue 7, p. 1519-1524 ]
Preflight calibration of ONC-T:
[2] Kameda, S. et al. (2 016), Preflight calibration test results for optical navigation camera telescope (ONC-T) onboard the Hayabusa2 spacecraft, Space Science Review, DOI 10.1007/s11 214-015-0227-y.
Inflight calibration of ONC-T, W1, W2:
[3] Suzuki, H. et al. (2018), Initial Inflight Calibration for Hayabusa2 Optical Navigation Camera (O NC) for Scientific Observations of Asteroid Ryugu, Icarus, Volume 300, p. 341-35 9.
[4] Tatsumi, E. et al . (2019), Updated inflight calibration of Hayabusa2's optical navigation camera (ONC) for scientific observations during the cruise phase, Icarus, Volume 325, p . 153-195
Initial results on the Ryugu morphology and spectrum:
[5] Sugita, S. et al. (201 9), The geomorphology, color, and thermal properties of Ryugu: Implications for parent-body processes, Science, Volume 263, Issue 6437, doi:10.1126/science.aaw0 422.
Global photometric properties of (162173) Ryugu:
[6] Tatsumi, E. et al, (2020), Global photometric properties of (162173) Ryugu, A&A, 639, A83, https://doi.org/10.1051/0004-6361/201937096
Improved method of hydrous mineral detection (update of flatfields):
[7] Kameda, S. et al. (2021), Improved method of hydrous mineral detection by latitudinal distribution of 0.7-µm surface reflectance absorption on the asteroid Ryugu, Icarus, Volume 360, 114348, https://doi.org/10.1016/j.icarus.2021.114348
Post-arrival calibration of ONCs:
[8] Kouyama, T., et al. (2021), Post-arrival calibration of Hayabusa2's optical navigation cameras (ONCs): Severe effects from touchdown events, Icarus, Volume 360, 114353, https://doi.org/10.1016/j.icarus.2021.114353
For visual overview of the ONC: Hayabusa2 Remote Sensing I nstruments (Video)
https://www.youtube.com/watch?v=LFh_pe3O_xM
