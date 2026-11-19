"""Preprocessing that can be exported to JSON and replayed exactly in TypeScript
(web/src/lib/ml/preprocess.ts). Keep the two in step: any change here needs the same change there,
and `python -m ml.parity` + `pnpm test` prove they still agree."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

OTHER = "__other__"


def is_number_column(s: pd.Series) -> bool:
    return pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s)


def as_category(s: pd.Series) -> pd.Series:
    """Text form of a categorical column: booleans as 'true'/'false', whitespace stripped, NA kept."""
    if pd.api.types.is_bool_dtype(s):
        s = s.map(lambda v: None if pd.isna(v) else ("true" if v else "false"))
    return s.astype("string").str.strip()


class Preprocessor:
    """Median-imputes numbers (optionally standardises them) and one-hot encodes the top categories.

    Categories outside the top `max_categories` become `__other__`; a value never seen in training
    maps to `__other__` when that column exists, otherwise to all zeros."""

    def __init__(self, features: list[str], scale: bool = False, max_categories: int = 20,
                 required: list[str] | None = None) -> None:
        self.features = list(features)
        self.scale = scale
        self.max_categories = max_categories
        self.required = set(required or [])
        self.specs: list[dict] = []
        self.cols: list[dict] = []

    def fit(self, df: pd.DataFrame) -> "Preprocessor":
        self.specs, self.cols = [], []
        for name in self.features:
            s = df[name]
            if is_number_column(s):
                values = s.astype("float64")
                median = float(values.median()) if values.notna().any() else 0.0
                filled = values.fillna(median)
                center, scale = 0.0, 1.0
                if self.scale:
                    center = float(filled.mean())
                    std = float(filled.std(ddof=0))
                    scale = std if std > 0 and math.isfinite(std) else 1.0
                self.specs.append({
                    "name": name, "type": "number", "required": name in self.required, "impute": median,
                    "min": float(values.min()) if values.notna().any() else None,
                    "max": float(values.max()) if values.notna().any() else None,
                })
                self.cols.append({"feature": name, "op": "num", "center": center, "scale": scale})
            else:
                values = as_category(s)
                counts = values.value_counts(dropna=True)
                top = [str(v) for v in counts.index[: self.max_categories]]
                categories = top + ([OTHER] if len(counts) > self.max_categories else [])
                impute = top[0] if top else OTHER
                self.specs.append({
                    "name": name, "type": "category", "required": name in self.required,
                    "impute": impute, "categories": categories,
                })
                self.cols.extend({"feature": name, "op": "eq", "value": c} for c in categories)
        return self

    def _category_values(self, s: pd.Series, spec: dict) -> pd.Series:
        known = set(spec["categories"])
        values = as_category(s).fillna(spec["impute"])
        values = values.where(values != "", spec["impute"])
        if OTHER in known:
            values = values.where(values.isin(known), OTHER)
        return values

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        out = np.zeros((len(df), len(self.cols)), dtype=np.float64)
        prepared: dict[str, pd.Series] = {}
        for spec in self.specs:
            s = df[spec["name"]] if spec["name"] in df else pd.Series([None] * len(df), index=df.index)
            if spec["type"] == "number":
                prepared[spec["name"]] = pd.to_numeric(s, errors="coerce").astype("float64").fillna(spec["impute"])
            else:
                prepared[spec["name"]] = self._category_values(s, spec)
        for j, col in enumerate(self.cols):
            values = prepared[col["feature"]]
            if col["op"] == "num":
                out[:, j] = (values.to_numpy(dtype=np.float64) - col["center"]) / col["scale"]
            else:
                out[:, j] = (values == col["value"]).to_numpy(dtype=np.float64)
        return out

    def feature_specs(self) -> list[dict]:
        return [dict(s) for s in self.specs]

    def columns(self) -> list[dict]:
        return [dict(c) for c in self.cols]
