import re
from pathlib import Path

from ml.aq_levels import EU_PM10_DAILY_LIMIT, PM10_BANDS, PM25_BANDS, level_of

LEVELS_TS = Path(__file__).resolve().parents[2] / "mobile" / "src" / "aq" / "levels.ts"


def _ts_array(name: str) -> tuple[float, ...]:
    text = LEVELS_TS.read_text(encoding="utf-8")
    m = re.search(rf"export const {name} = \[([^\]]*)\]", text)
    assert m, f"{name} not found in {LEVELS_TS}"
    return tuple(float(x) for x in m.group(1).split(","))


def test_bands_match_mobile():
    assert PM25_BANDS == _ts_array("PM25_BANDS")
    assert PM10_BANDS == _ts_array("PM10_BANDS")
    text = LEVELS_TS.read_text(encoding="utf-8")
    assert f"EU_PM10_DAILY_LIMIT = {int(EU_PM10_DAILY_LIMIT)}" in text


def test_level_is_worse_of_two():
    assert level_of(4, 10) == 1
    assert level_of(5, 15) == 1  # upper bound is inclusive
    assert level_of(5.1, 10) == 2
    assert level_of(20, 10) == 3
    assert level_of(10, 130) == 4
    assert level_of(200, 10) == 6
