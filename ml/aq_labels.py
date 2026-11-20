"""Reason labels for the forecast's "why" (daily[].reasons). Keys are the feature groups the model reports."""
from __future__ import annotations

REASONS: dict[str, tuple[str, str]] = {
    # group: (label_bg, label_en) for a group that pushes PM up; the down labels follow.
    "pbl_height": ("нисък слой на смесване (инверсия)", "low mixing layer (inversion)"),
    "wind_speed": ("слаб вятър", "weak wind"),
    "temp": ("студено – повече отопление", "cold – more heating"),
    "rh": ("висока влажност, мъгла", "high humidity, fog"),
    "precip": ("без валежи", "no rain to wash the air"),
    "persistence": ("въздухът вече е замърсен", "the air is already polluted"),
    "neighbours": ("замърсено в съседните квартали", "polluted in nearby areas"),
    "cams": ("регионален пренос (CAMS)", "regional transport (CAMS)"),
    "calendar": ("вечер – пик на отоплението", "evening heating peak"),
}

REASONS_DOWN: dict[str, tuple[str, str]] = {
    "pbl_height": ("добро разсейване", "good mixing"),
    "wind_speed": ("вятър разсейва замърсяването", "wind disperses pollution"),
    "temp": ("по-топло – по-малко отопление", "milder – less heating"),
    "rh": ("сух въздух", "dry air"),
    "precip": ("валежи изчистват въздуха", "rain cleans the air"),
    "persistence": ("въздухът сега е чист", "the air is clean now"),
    "neighbours": ("чисто в съседните квартали", "clean in nearby areas"),
    "cams": ("слаб регионален пренос (CAMS)", "little regional transport (CAMS)"),
    "calendar": ("ден – по-малко отопление", "daytime – less heating"),
}


def reason(group: str, impact: float) -> dict:
    bg, en = (REASONS if impact >= 0 else REASONS_DOWN)[group]
    return {"feature": group, "label_bg": bg, "label_en": en, "impact": round(float(impact), 1)}

# Neutral names for the feature groups, for the importance chart ("what the model looks at").
GROUP_NAMES: dict[str, tuple[str, str]] = {
    "persistence": ("замърсяване в последните часове", "pollution in the last hours"),
    "neighbours": ("съседни сензори", "nearby sensors"),
    "pbl_height": ("слой на смесване (инверсия)", "mixing layer (inversion)"),
    "wind_speed": ("вятър", "wind"),
    "temp": ("температура", "temperature"),
    "rh": ("влажност", "humidity"),
    "precip": ("валежи", "rain"),
    "cams": ("прогноза CAMS", "CAMS forecast"),
    "calendar": ("час, ден, сезон", "hour, day, season"),
    "static": ("място на сензора", "sensor location"),
}
