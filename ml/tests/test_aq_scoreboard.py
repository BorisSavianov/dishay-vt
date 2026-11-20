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


# ---------------- Task 3: replay scoring ----------------

from ml.aq_scoreboard import mae, pick_blh, run_block, vt_days


def rows_for(day: str, hours: int, obs_hours: int, vt: bool = True, sensor: int = 1, obs: float = 20.0) -> pd.DataFrame:
    t = pd.date_range(pd.Timestamp(day, tz=TZ), periods=hours, freq="h")
    o = np.where(np.arange(hours) < obs_hours, obs, np.nan)
    return pd.DataFrame({"date": day, "sensor": sensor, "t": t, "vt": vt,
                         "model_pm25": 18.0, "model_pm10": 30.0, "cams_pm25": 12.0, "cams_pm10": 20.0,
                         "persistence_pm25": 25.0, "obs_pm25": o, "obs_pm10": o * 1.6})


def test_mae_drops_rows_missing_any_input():
    rows = pd.DataFrame({"obs_pm25": [10, 20, np.nan], "model_pm25": [12, 18, 5],
                         "cams_pm25": [15, np.nan, 5], "persistence_pm25": [11, 25, 5]})
    assert mae(rows) == {"model": 2.0, "cams": 5.0, "persistence": 1.0}


def test_vt_days_needs_18_hours():
    rows = pd.concat([rows_for("2026-11-02", 24, 24), rows_for("2026-11-03", 24, 17),
                      rows_for("2026-11-02", 24, 24, vt=False, sensor=2, obs=90.0)], ignore_index=True)
    days = vt_days(rows)
    assert [r["date"] for r in days] == ["2026-11-02"]
    d = days[0]
    assert d["observed_pm10"] == 32.0 and d["model_pm10"] == 30.0 and d["cams_pm10"] == 20.0
    assert d["observed_level"] == 3 and d["model_level"] == 3  # PM2.5 20 / 18 → band 3


def test_pick_blh_prefers_strict_when_it_wins():
    win = {"mae_pm25_next_day": {"vt": {"model": 3.0, "cams": 6.0}}}
    lose = {"mae_pm25_next_day": {"vt": {"model": 6.5, "cams": 6.0}}}
    assert pick_blh({"none": win, "era5": win}) == "none"
    assert pick_blh({"none": lose, "era5": win}) == "era5"


def test_run_block_matches_contract():
    rows = pd.concat([rows_for("2026-11-02", 24, 24), rows_for("2026-11-03", 24, 20),
                      rows_for("2026-11-02", 24, 24, vt=False, sensor=2, obs=30.0)], ignore_index=True)
    block = run_block(rows, "none")
    assert block["from"] == "2026-11-02" and block["to"] == "2026-11-03" and block["days"] == 2
    assert block["blh"] == "none" and block["weather"] == "forecast" and block["issued_local"] == "12:00"
    assert block["mae_pm25_next_day"]["vt"] == {"model": 2.0, "cams": 8.0, "persistence": 5.0}
    assert validate(payload_with({"updated_at": NOW_ISO, "replay": block})) == []


# ---------------- Task 4: live log and score ----------------

import json

from ml.aq_scoreboard import live_score, log_issued, read_log, scoreboard_block

TIMES = pd.date_range("2026-11-20T10:00Z", periods=7, freq="h")   # 10:00Z .. 16:00Z
IDS = np.array([101])
OBS = np.full((7, 1), 10.0, dtype=np.float32)


def ts(hhmm: str) -> pd.Timestamp:
    return pd.Timestamp(f"2026-11-20T{hhmm}Z")


def log_rows(issued: str, targets: list[str], sensor: int = 101) -> pd.DataFrame:
    i = ts(issued)
    t = [ts(x) for x in targets]
    return pd.DataFrame({"issued_at": i, "sensor_id": sensor, "t": t,
                         "horizon_h": [int((x - i) / pd.Timedelta(hours=1)) for x in t],
                         "pm25": 11.0, "pm10": 18.0, "cams_pm25": 14.0, "persistence_pm25": 12.0})


def test_live_score_none_before_any_hour_passes():
    assert live_score(log_rows("12:00", ["13:00"]), OBS, TIMES, IDS, upto=ts("12:00")) is None


def test_live_score_counts_hours_and_horizons():
    log = pd.concat([log_rows("12:00", ["13:00", "14:00", "15:00", "16:00"]), log_rows("13:00", ["14:00", "15:00"]),
                     log_rows("12:00", ["13:00"], sensor=999)], ignore_index=True)
    s = live_score(log, OBS, TIMES, IDS, upto=ts("15:00"))
    assert s["checked_hours"] == 3 and s["horizons"] == "1–3 h"
    assert s["mae_pm25"] == {"model": 1.0, "cams": 4.0, "persistence": 2.0}
    assert s["since"] == "2026-11-20T14:00:00+02:00"


def test_log_roundtrip(tmp_path):
    rows = log_rows("12:00", ["13:00", "14:00"])
    a = log_issued(ts("12:00"), rows, tmp_path)
    log_issued(ts("13:00"), rows, tmp_path)
    assert a.name == "issued-20261120-12.parquet"
    assert len(read_log(tmp_path)) == 2 * len(rows)
    assert read_log(tmp_path / "missing").empty


def test_scoreboard_block_absent_without_inputs(tmp_path):
    assert scoreboard_block(None, cache=tmp_path / "missing.json") is None


def test_scoreboard_block_uses_chosen_run(tmp_path):
    cache = tmp_path / "replay.json"
    cache.write_text(json.dumps({"chosen": "era5", "runs": {"none": {"blh": "none"}, "era5": EXAMPLE["replay"] | {"blh": "era5"}}}))
    b = scoreboard_block(None, cache=cache)
    assert b["replay"]["blh"] == "era5" and "live" not in b and b["updated_at"].endswith("+02:00")
    assert validate(payload_with(b)) == []


# ---------------- Final review fixes ----------------

def test_run_block_discloses_cams_source():
    rows = pd.concat([rows_for("2026-11-02", 24, 24)], ignore_index=True)
    assert run_block(rows, "none")["cams"] == "archive"


def test_scoreboard_block_drops_invalid_replay_keeps_live(tmp_path):
    bad = copy.deepcopy(EXAMPLE["replay"])
    bad["mae_pm25_next_day"]["vt"]["model"] = float("nan")
    cache = tmp_path / "replay.json"
    cache.write_text(json.dumps({"chosen": "none", "runs": {"none": bad}}))
    b = scoreboard_block(EXAMPLE["live"], cache=cache)
    assert "replay" not in b and b["live"] == EXAMPLE["live"]


def test_scoreboard_block_drops_nan_anywhere(tmp_path):
    bad = copy.deepcopy(EXAMPLE["replay"])
    bad["vt_days"][0]["cams_pm10"] = float("nan")
    cache = tmp_path / "replay.json"
    cache.write_text(json.dumps({"chosen": "none", "runs": {"none": bad}}))
    assert scoreboard_block(None, cache=cache) is None
