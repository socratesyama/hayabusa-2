import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from minispice import et2utc, utc2et


class TimeConversionTests(unittest.TestCase):
    # Reference ET values from NAIF SPICE with naif0012.tls; ET is seconds past J2000 TDB.
    def test_utc_to_et_matches_spice_reference(self):
        references = {
            "2000-01-01T12:00:00": 64.18392728473108,
            "2014-12-03T00:00:00": 470836867.1831233,
            "2018-06-27T00:00:00": 583329669.1842322,
            "2019-02-21T22:29:10": 604060219.1852506,
        }
        for stamp, expected in references.items():
            with self.subTest(stamp=stamp):
                self.assertLess(abs(utc2et(stamp) - expected), 5e-4)

    def test_et_to_utc_round_trip_across_leap_offsets(self):
        stamps = [
            "2000-01-01T12:00:00",
            "2014-12-03T00:00:00",
            "2015-06-30T23:59:59",
            "2015-07-01T00:00:00",
            "2017-01-01T00:00:00",
            "2019-02-21T22:29:10",
        ]
        for stamp in stamps:
            with self.subTest(stamp=stamp):
                original = datetime.fromisoformat(stamp)
                restored = et2utc(utc2et(stamp))
                self.assertLess(abs((restored - original).total_seconds()), 5e-4)

    def test_j2000_et_epoch_uses_historical_dat(self):
        # ET=0 is TDB noon; UTC is earlier by the historical UTC-TAI and TT-TDB offsets.
        restored = et2utc(0)
        expected = datetime(2000, 1, 1, 11, 58, 55, 816000)
        self.assertLess(abs((restored - expected).total_seconds()), 5e-4)


if __name__ == "__main__":
    unittest.main()
