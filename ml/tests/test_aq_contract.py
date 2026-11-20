import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from ml.aq_contract import validate
from ml.aq_mock import build

ROOT = Path(__file__).resolve().parents[2]


def test_mock_build_is_valid():
    payload = build(dt.datetime(2026, 11, 20, 9, 50, tzinfo=ZoneInfo("Europe/Sofia")))
    assert validate(payload) == []
    vt = payload["stations"][0]
    assert vt["featured"] and len(vt["hourly"]) == 72 and len(vt["daily"]) == 3
    assert vt["hourly"][0]["t"].endswith("+02:00")


def test_committed_file_is_valid():
    payload = json.loads((ROOT / "web" / "src" / "data" / "aq_forecast.json").read_text(encoding="utf-8"))
    assert validate(payload) == []


def test_validate_catches_wrong_level():
    payload = build(dt.datetime(2026, 11, 20, 9, 50, tzinfo=ZoneInfo("Europe/Sofia")))
    payload["stations"][0]["daily"][0]["level"] = 6 if payload["stations"][0]["daily"][0]["level"] != 6 else 1
    assert any("level" in e for e in validate(payload))
