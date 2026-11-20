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
