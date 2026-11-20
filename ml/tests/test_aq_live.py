import json
import time

import httpx
import pandas as pd
import pytest

from ml import aq_forecast
from ml.aq_features import MIN_READINGS
from ml.aq_live import N_1H, parse_1h

HOUR = pd.Timestamp("2026-11-20T10:00Z")


def rec(sid, ts, p1="12.5", p2="7.25", country="BG"):
    vals = [{"value_type": k, "value": v} for k, v in (("P1", p1), ("P2", p2)) if v is not None]
    return {"timestamp": ts, "location": {"country": country}, "sensor": {"id": sid, "sensor_type": {"name": "SDS011"}},
            "sensordatavalues": vals}


def test_parse_1h_known_sensors_filed_as_the_hour():
    recs = [rec(1, "2026-11-20 11:20:00"), rec(2, "2026-11-20 11:21:00", p2=None), rec(999, "2026-11-20 11:20:00"),
            {"timestamp": "2026-11-20 11:20:00", "sensor": {"id": 3}, "sensordatavalues": [{"value_type": "temperature", "value": "3"}]}]
    df = parse_1h(recs, [1, 2, 3], HOUR)
    assert df["sensor_id"].tolist() == [1, 2]
    assert (df["hour"] == HOUR).all() and (df["n"] == N_1H).all() and N_1H >= MIN_READINGS
    assert df.loc[0, "pm10"] == 12.5 and df.loc[0, "pm25"] == 7.25 and pd.isna(df.loc[1, "pm25"])
    assert str(df["t"].dt.tz) == "UTC"


def test_parse_1h_drops_stale_and_bad_values_keeps_latest_duplicate():
    recs = [rec(1, "2026-11-20 09:59:00"), rec(2, "2026-11-20 11:00:00", p1="x", p2="nan?"),
            rec(4, "2026-11-20 11:00:00", p1="1"), rec(4, "2026-11-20 11:05:00", p1="2")]
    df = parse_1h(recs, [1, 2, 4], HOUR)
    assert df["sensor_id"].tolist() == [4] and df.loc[0, "pm10"] == 2.0


def test_parse_1h_empty():
    df = parse_1h([], [1], HOUR)
    assert df.empty and {"sensor_id", "hour", "pm10", "pm25", "n", "t"} <= set(df.columns)


# ---------------- Open-Meteo cache ----------------

class FakeClient:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), 0

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        status, body = self.responses.pop(0)
        return httpx.Response(status, json=body, request=httpx.Request("GET", url))


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(aq_forecast, "FC_CACHE", tmp_path)
    monkeypatch.setattr(aq_forecast.time, "sleep", lambda s: None)
    return tmp_path


def put(cache, name, data, age_s):
    (cache / name).write_text(json.dumps({"fetched_at": time.time() - age_s, "data": data}))


def test_fresh_cache_is_used_without_fetching(cache):
    put(cache, "w.json", [{"cell": "a"}], 3600)
    c = FakeClient([])
    assert aq_forecast._batched(c, "https://api.open-meteo.com/x", ["43.00_25.50"], {}, "w.json") == [{"cell": "a"}]
    assert c.calls == 0


def test_old_cache_is_refreshed_after_a_429(cache):
    put(cache, "w.json", [{"cell": "old"}], 4 * 3600)
    c = FakeClient([(429, {}), (200, {"hourly": {}})])
    out = aq_forecast._batched(c, "https://api.open-meteo.com/x", ["43.00_25.50"], {}, "w.json")
    assert out == [{"hourly": {}, "cell": "43.00_25.50"}] and c.calls == 2
    saved = json.loads((cache / "w.json").read_text())
    assert saved["data"] == out and time.time() - saved["fetched_at"] < 60


def test_repeated_429_serves_the_stale_cache(cache):
    put(cache, "w.json", [{"cell": "old"}], 5 * 3600)
    c = FakeClient([(429, {})] * 3)
    assert aq_forecast._batched(c, "https://api.open-meteo.com/x", ["43.00_25.50"], {}, "w.json") == [{"cell": "old"}]


def test_no_usable_cache_fails_the_run(cache):
    put(cache, "w.json", [{"cell": "old"}], 30 * 3600)
    with pytest.raises(httpx.HTTPStatusError):
        aq_forecast._batched(FakeClient([(429, {})] * 3), "https://api.open-meteo.com/x", ["43.00_25.50"], {}, "w.json")
    with pytest.raises(httpx.HTTPStatusError):
        aq_forecast._batched(FakeClient([(500, {})] * 3), "https://api.open-meteo.com/x", ["43.00_25.50"], {}, "none.json")


def test_legacy_cache_list_is_aged_by_mtime(cache):
    (cache / "w.json").write_text(json.dumps([{"cell": "legacy"}]))
    data, age = aq_forecast._read_cache("w.json")
    assert data == [{"cell": "legacy"}] and age < 60
