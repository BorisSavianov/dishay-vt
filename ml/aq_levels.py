"""EEA European Air Quality Index bands, shared with the apps.

Mirrors mobile/src/aq/levels.ts (PM25_BANDS, PM10_BANDS). ml/tests/test_aq_levels.py fails if they drift.
Values are upper bounds (µg/m³) of levels 1..5; anything above the last is level 6."""
from __future__ import annotations

PM25_BANDS: tuple[float, ...] = (5, 15, 50, 90, 140)
PM10_BANDS: tuple[float, ...] = (15, 45, 120, 195, 270)
EU_PM10_DAILY_LIMIT = 50.0

LEVEL_NAMES_BG = {1: "добро", 2: "задоволително", 3: "умерено", 4: "лошо", 5: "много лошо", 6: "изключително лошо"}
LEVEL_NAMES_EN = {1: "good", 2: "fair", 3: "moderate", 4: "poor", 5: "very poor", 6: "extremely poor"}

# Profile rules (docs/hackathon-plan.md): sensitive groups from level 3, everyone else from level 4.
ALERT_THRESHOLD = {"asthma": 3, "child": 3, "elderly": 3, "runner": 3, "general": 4}


def band_of(value: float, bands: tuple[float, ...]) -> int:
    for i, upper in enumerate(bands):
        if value <= upper:
            return i + 1
    return 6


def level_of(pm25: float, pm10: float) -> int:
    """The worse of the PM2.5 and PM10 levels, as the EAQI does."""
    return max(band_of(pm25, PM25_BANDS), band_of(pm10, PM10_BANDS))
