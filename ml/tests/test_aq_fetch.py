import datetime as dt

from ml.aq_fetch import archive_url, hourly_from_csv

CSV = """sensor_id;sensor_type;location;lat;lon;timestamp;P1;durP1;ratioP1;P2;durP2;ratioP2
35767;SDS011;24686;43.07;25.62;2024-01-15T00:00:32;40.0;;;30.0;;
35767;SDS011;24686;43.07;25.62;2024-01-15T00:02:58;50.0;;;;;
35767;SDS011;24686;43.07;25.62;2024-01-15T01:05:00;bad;;;10.0;;
35767;SDS011;24686;43.07;25.62;2024-01-15T01:07:00;2500;;;12.0;;
"""


def test_hourly_means_skip_bad_values():
    rows = hourly_from_csv(CSV)
    assert rows[0] == ("2024-01-15T00:00:00", 45.0, 30.0, 2)
    hour, pm10, pm25, n = rows[1]
    assert hour == "2024-01-15T01:00:00" and pm10 is None and pm25 == 11.0 and n == 2


def test_archive_url_layout():
    assert archive_url("SDS011", 1, dt.date(2024, 1, 15)) == (
        "https://archive.sensor.community/2024/2024-01-15/2024-01-15_sds011_sensor_1.csv.gz")
    assert archive_url("SDS011", 1, dt.date(2026, 3, 1)) == (
        "https://archive.sensor.community/2026-03-01/2026-03-01_sds011_sensor_1.csv")
