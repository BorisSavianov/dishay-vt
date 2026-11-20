import copy
import datetime as dt
from zoneinfo import ZoneInfo

from ml.aq_contract import validate
from ml.aq_mock import build

NOW = dt.datetime(2026, 11, 20, 13, 7, tzinfo=ZoneInfo("Europe/Sofia"))
NOW_ISO = NOW.isoformat()

EXAMPLE = {
    "updated_at": "2026-11-20T13:07:00+02:00",
    "replay": {
        "from": "2026-11-01", "to": "2026-11-19", "issued_local": "12:00",
        "models": "trained before winter 2025/26", "weather": "forecast", "blh": "none", "days": 19,
        "mae_pm25_next_day": {"vt": {"model": 3.4, "cams": 6.0, "persistence": 4.9},
                              "bg": {"model": 3.0, "cams": 7.7, "persistence": 4.2}},
        "vt_days": [{"date": "2026-11-02", "model_pm10": 41.0, "cams_pm10": 22.0, "observed_pm10": 45.3,
                     "model_level": 2, "observed_level": 2}],
    },
    "live": {"since": "2026-11-20T10:00:00+02:00", "checked_hours": 37, "horizons": "1–6 h",
             "mae_pm25": {"model": 2.1, "cams": 4.0, "persistence": 2.6}},
}


def payload_with(scoreboard=None) -> dict:
    p = build(NOW)
    if scoreboard is not None:
        p["model"]["scoreboard"] = copy.deepcopy(scoreboard)
    return p


def sb_errors(payload) -> list[str]:
    return [e for e in validate(payload) if e.startswith("model.scoreboard")]


# ---------------- Task 1: contract ----------------

def test_scoreboard_optional():
    assert sb_errors(payload_with()) == []


def test_scoreboard_valid():
    assert validate(payload_with(EXAMPLE)) == []


def test_scoreboard_bad_blh():
    bad = copy.deepcopy(EXAMPLE)
    bad["replay"]["blh"] = "observed"
    assert any("model.scoreboard.replay.blh" in e for e in sb_errors(payload_with(bad)))


def test_scoreboard_bad_live():
    bad = copy.deepcopy(EXAMPLE)
    bad["live"]["checked_hours"] = 0
    assert any("model.scoreboard.live.checked_hours" in e for e in sb_errors(payload_with(bad)))


def test_scoreboard_bad_mae():
    bad = copy.deepcopy(EXAMPLE)
    bad["replay"]["mae_pm25_next_day"]["bg"]["cams"] = None
    assert any("model.scoreboard.replay.mae_pm25_next_day.bg.cams" in e for e in sb_errors(payload_with(bad)))


def test_scoreboard_parts_optional():
    only_live = {k: v for k, v in EXAMPLE.items() if k != "replay"}
    only_replay = {k: v for k, v in EXAMPLE.items() if k != "live"}
    assert sb_errors(payload_with(only_live)) == [] and sb_errors(payload_with(only_replay)) == []


# ---------------- Task 2: forecast weather ----------------

import numpy as np
import pandas as pd
import pytest

import ml.aq_scoreboard as sbm
from ml.aq_features import TZ, Panel
from ml.aq_scoreboard import PREV_VARS, apply_weather, forecast_weather, lead_day, previous_runs

CELL = "43.00_25.50"


def frame(value: float, day: str = "2026-11-02") -> pd.DataFrame:
    """One cell, every hour of a local day, every forecast variable = value."""
    t = pd.date_range(pd.Timestamp(day, tz=TZ), periods=24, freq="h").tz_convert("UTC")
    return pd.DataFrame({"time": t, "cell": CELL, **{v: value for v in PREV_VARS}})


def test_lead_day_never_newer_than_issue():
    assert [lead_day(h) for h in (12, 24, 25, 35)] == [1, 1, 2, 2]


def test_forecast_weather_picks_by_local_hour():
    wx = forecast_weather({1: frame(1.0), 2: frame(2.0)})
    local = wx.set_index(wx["time"].dt.tz_convert(TZ).dt.hour)["temperature_2m"]
    assert len(wx) == 24
    assert local[0] == 1.0 and local[12] == 1.0 and local[13] == 2.0 and local[23] == 2.0


def test_previous_runs_nulls_become_nan(tmp_path, monkeypatch):
    def fake_get_json(client, url, params):
        hours = [f"2026-11-01T{h:02d}:00" for h in range(24)]
        cols = [c for c in params["hourly"].split(",")]
        return {"hourly": {"time": hours, **{c: [None] * 24 for c in cols}}}
    monkeypatch.setattr(sbm, "get_json", fake_get_json)
    monkeypatch.setattr(sbm, "PREV_CACHE", tmp_path)
    f = previous_runs([CELL], dt.date(2026, 11, 1), dt.date(2026, 11, 1))
    assert set(f) == {1, 2}
    assert len(f[1]) == 24 and f[1]["temperature_2m"].isna().all()
    assert list(tmp_path.glob("*.json")), "responses are cached"


@pytest.fixture
def toy_panel() -> Panel:
    times = pd.date_range("2026-11-01T00:00Z", periods=72, freq="h")
    sensors = pd.DataFrame({"id": [1, 2], "type": ["SDS011"] * 2, "lat": [43.0, 43.0], "lon": [25.5, 25.5],
                            "cell": [CELL, CELL], "elevation": [200.0, 200.0], "type_code": [0, 0]})
    pm = np.full((72, 2), 10.0, dtype=np.float32)
    weather = {v: np.full((72, 1), 5.0) for v in PREV_VARS + ["boundary_layer_height"]}
    return Panel(times, sensors, pm, pm.copy(), pm.copy(), [CELL], weather, np.full((72, 1), 8.0),
                 np.full((72, 1), 12.0), np.array([0, 0]), np.zeros((2, 2)))


def test_apply_weather_replaces_inside_window(toy_panel):
    start, end = pd.Timestamp("2026-11-02T00:00Z"), pd.Timestamp("2026-11-02T23:00Z")
    wx = forecast_weather({1: frame(1.0), 2: frame(2.0)})
    apply_weather(toy_panel, wx, "era5", start, end)
    t = toy_panel.weather["temperature_2m"][:, 0]
    inside = (toy_panel.times >= start) & (toy_panel.times <= end)
    assert set(np.unique(t[inside][~np.isnan(t[inside])])) <= {1.0, 2.0}
    assert (t[~inside] == 5.0).all()
    assert (toy_panel.weather["boundary_layer_height"][:, 0] == 5.0).all(), "era5 mode keeps BLH"


def test_apply_weather_blh_none(toy_panel):
    start, end = pd.Timestamp("2026-11-02T00:00Z"), pd.Timestamp("2026-11-02T23:00Z")
    apply_weather(toy_panel, forecast_weather({1: frame(1.0), 2: frame(2.0)}), "none", start, end)
    blh = toy_panel.weather["boundary_layer_height"][:, 0]
    inside = (toy_panel.times >= start) & (toy_panel.times <= end)
    assert np.isnan(blh[inside]).all()
    assert not np.isnan(blh[~inside]).any()
