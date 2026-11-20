"""Write web/src/lib/ml/__fixtures__/parity.json: exported models plus inputs and the predictions
scikit-learn makes for them. The Vitest parity test runs the TypeScript evaluator on the same inputs
and must get the same answers. Re-run after changing preprocess.py or export.py.

    uv run --group ml python -m ml.parity"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.datasets import load_breast_cancer, load_iris
from sklearn.ensemble import (
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from ml.export import export_estimator
from ml.fixture import diabetes_frame
from ml.preprocess import Preprocessor
from ml.train import _clean, prepare_target

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "src" / "lib" / "ml" / "__fixtures__" / "parity.json"


def iris_frame() -> pd.DataFrame:
    df = load_iris(as_frame=True).frame
    df["species"] = df.pop("target").map(dict(enumerate(load_iris().target_names)))
    df["petal_band"] = pd.cut(df["petal length (cm)"], [0, 2, 5, 10], labels=["short", "mid", "long"]).astype(str)
    return df


def cancer_frame() -> pd.DataFrame:
    data = load_breast_cancer(as_frame=True)
    df = data.frame[list(data.feature_names[:6]) + ["target"]].copy()
    df["diagnosis"] = df.pop("target").map({0: "malignant", 1: "benign"})
    return df


def probe_rows(df: pd.DataFrame, features: list[str], n: int = 12) -> list[dict]:
    """Real rows plus rows with a missing number, a missing category and an unseen category."""
    rows = df[features].sample(n=n, random_state=7).to_dict(orient="records")
    numbers = [f for f in features if pd.api.types.is_numeric_dtype(df[f])]
    categories = [f for f in features if f not in numbers]
    if numbers:
        rows[0][numbers[0]] = None
        rows[1] = {k: v for k, v in rows[1].items() if k != numbers[-1]}
    if categories:
        rows[2][categories[0]] = None
        rows[3][categories[0]] = "never-seen"
        rows[4][categories[0]] = f"  {rows[4][categories[0]]}  "
    return [{k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in r.items()} for r in rows]


def case_set(name: str, df: pd.DataFrame, target: str, task: str, est, scale: bool, max_categories: int = 20) -> dict:
    features = [c for c in df.columns if c != target]
    pre = Preprocessor(features, scale=scale, max_categories=max_categories).fit(df)
    est.fit(pre.transform(df), prepare_target(df[target], task))
    rows = probe_rows(df, features)
    x = pre.transform(pd.DataFrame(rows, columns=features))
    cases = []
    if task == "regression":
        for row, value in zip(rows, est.predict(x)):
            cases.append({"input": row, "expected": {"value": float(value)}})
    else:
        classes = [str(c) for c in est.classes_]
        for row, label, proba in zip(rows, est.predict(x), est.predict_proba(x)):
            cases.append({"input": row, "expected": {
                "label": str(label), "probabilities": dict(zip(classes, map(float, proba)))}})
    model = {
        "task": task,
        "target": {"name": target, "unit": None, **({"classes": [str(c) for c in est.classes_]} if task != "regression" else {})},
        "features": pre.feature_specs(),
        "columns": pre.columns(),
        "estimator": export_estimator(est, task),
    }
    return _clean({"name": name, "model": model, "cases": cases})


def main() -> None:
    diabetes, iris, cancer = diabetes_frame(), iris_frame(), cancer_frame()
    sets = [
        case_set("tree-regression", diabetes, "progression", "regression", DecisionTreeRegressor(max_depth=6, random_state=0), False),
        case_set("forest-regression", diabetes, "progression", "regression", RandomForestRegressor(n_estimators=20, max_depth=6, random_state=0), False),
        case_set("extratrees-regression", diabetes, "progression", "regression", ExtraTreesRegressor(n_estimators=10, max_depth=5, random_state=0), False),
        case_set("gbm-regression", diabetes, "progression", "regression", GradientBoostingRegressor(n_estimators=40, random_state=0), False),
        case_set("ridge-regression", diabetes, "progression", "regression", Ridge(alpha=1.0), True),
        case_set("tree-multiclass", iris, "species", "classification", DecisionTreeClassifier(max_depth=3, random_state=0), False),
        case_set("forest-multiclass", iris, "species", "classification", RandomForestClassifier(n_estimators=15, random_state=0), False),
        case_set("gbm-multiclass", iris, "species", "classification", GradientBoostingClassifier(n_estimators=20, random_state=0), False),
        case_set("gbm-binary", cancer, "diagnosis", "classification", GradientBoostingClassifier(n_estimators=30, random_state=0), False),
        case_set("logistic-multiclass", iris, "species", "classification", LogisticRegression(max_iter=2000), True),
        case_set("logistic-binary", cancer, "diagnosis", "classification", LogisticRegression(max_iter=5000), True),
        case_set("tree-other-bucket", iris, "species", "classification", DecisionTreeClassifier(max_depth=4, random_state=0), False, max_categories=2),
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"sets": sets}, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(sets)} model sets, {sum(len(s['cases']) for s in sets)} cases, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
