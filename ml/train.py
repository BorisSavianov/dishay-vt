"""Train, compare and export a tabular model.

    uv run --group ml python -m ml.train --data data/raw/x.csv --target y [--features a,b,c]

Splits off a holdout, cross-validates every candidate on the training part (preprocessing is fitted
inside each fold, so nothing leaks), picks the best by the primary metric, scores it and a dummy
baseline on the holdout, refits on all rows and writes web/src/model/model.json plus a report."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, TimeSeriesSplit, train_test_split
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from ml.data import load_table
from ml.export import export_estimator, importances
from ml.preprocess import Preprocessor, is_number_column

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "src" / "model" / "model.json"
REPORTS = ROOT / "ml" / "reports"
FAMILIES = ("tree", "forest", "gbm", "linear")
PRIMARY = {"regression": ("rmse", "lower"), "classification": ("f1_macro", "higher")}


@dataclass
class TrainConfig:
    target: str
    features: list[str] | None = None
    task: str = "auto"
    models: tuple[str, ...] = FAMILIES
    seed: int = 42
    test_size: float = 0.2
    cv: int = 5
    time_col: str | None = None
    test_from: float | None = None
    refit_all: bool = True
    required: list[str] = field(default_factory=list)
    max_categories: int = 20
    kind: str = "trained"
    name: str | None = None
    unit: str | None = None
    source: str = "unspecified"
    license: str = "unspecified"
    as_of: str | None = None


def detect_task(y: pd.Series) -> str:
    if not is_number_column(y):
        return "classification"
    values = y.dropna()
    if values.nunique() <= 10 and np.all(np.mod(values, 1) == 0):
        return "classification"
    return "regression"


def prepare_target(y: pd.Series, task: str) -> pd.Series:
    if task == "regression":
        return pd.to_numeric(y, errors="raise").astype("float64")
    if pd.api.types.is_bool_dtype(y):
        return y.map(lambda v: "true" if v else "false").astype(str)
    if is_number_column(y) and np.all(np.mod(y, 1) == 0):
        return y.astype("int64").astype(str)
    return y.astype(str).str.strip()


def candidates(task: str, families: tuple[str, ...], seed: int) -> list[tuple[str, object, bool]]:
    """(name, unfitted estimator, needs scaling). Sizes are capped so model.json stays small."""
    reg = task == "regression"
    out: list[tuple[str, object, bool]] = []
    if "tree" in families:
        for depth in (3, 5, 8):
            cls = DecisionTreeRegressor if reg else DecisionTreeClassifier
            out.append((f"tree(max_depth={depth})", cls(max_depth=depth, min_samples_leaf=5, random_state=seed), False))
    if "forest" in families:
        cls = RandomForestRegressor if reg else RandomForestClassifier
        out.append(("forest", cls(n_estimators=50, max_depth=8, min_samples_leaf=3, random_state=seed, n_jobs=-1), False))
    if "gbm" in families:
        cls = GradientBoostingRegressor if reg else GradientBoostingClassifier
        out.append(("gbm", cls(n_estimators=150, max_depth=3, learning_rate=0.05, random_state=seed), False))
    if "linear" in families:
        out.append(("linear", Ridge(alpha=1.0) if reg else LogisticRegression(max_iter=2000), True))
    if not out:
        raise ValueError(f"no model families selected; choose from {FAMILIES}")
    return out


def score(task: str, y_true, y_pred, proba=None, classes=None) -> dict:
    if task == "regression":
        return {
            "mae": float(mean_absolute_error(y_true, y_pred)),
            "rmse": float(math.sqrt(mean_squared_error(y_true, y_pred))),
            "r2": float(r2_score(y_true, y_pred)) if len(y_true) > 1 else float("nan"),
        }
    out = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
    }
    if proba is not None and classes is not None and len(classes) == 2 and len(set(y_true)) == 2:
        out["roc_auc"] = float(roc_auc_score(np.asarray(y_true) == classes[1], proba[:, 1]))
    return out


def _fit_predict(est, scale: bool, cfg: TrainConfig, features, train_df, y_train, test_df):
    pre = Preprocessor(features, scale=scale, max_categories=cfg.max_categories, required=cfg.required).fit(train_df)
    model = clone(est).fit(pre.transform(train_df), y_train)
    x_test = pre.transform(test_df)
    proba = model.predict_proba(x_test) if hasattr(model, "predict_proba") else None
    return model, pre, model.predict(x_test), proba


def _folds(task: str, cfg: TrainConfig, y: pd.Series):
    n = len(y)
    k = max(2, min(cfg.cv, n // 2))
    if cfg.time_col:
        return TimeSeriesSplit(n_splits=k).split(np.zeros(n))
    if task == "classification" and y.value_counts().min() >= k:
        return StratifiedKFold(n_splits=k, shuffle=True, random_state=cfg.seed).split(np.zeros(n), y)
    return KFold(n_splits=k, shuffle=True, random_state=cfg.seed).split(np.zeros(n))


def _better(task: str, a: float, b: float) -> bool:
    return a < b if PRIMARY[task][1] == "lower" else a > b


def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        return float(obj) if math.isfinite(float(obj)) else None
    if isinstance(obj, np.integer):
        return int(obj)
    return obj


def run(df: pd.DataFrame, cfg: TrainConfig) -> tuple[dict, dict]:
    """Returns (model artifact for the web app, full report)."""
    if cfg.target not in df:
        raise KeyError(f"target {cfg.target!r} not in columns: {list(df.columns)}")
    features = cfg.features or [c for c in df.columns if c != cfg.target]
    missing = [f for f in features if f not in df]
    if missing:
        raise KeyError(f"features not in columns: {missing}")
    df = df[df[cfg.target].notna()].reset_index(drop=True)
    task = detect_task(df[cfg.target]) if cfg.task == "auto" else cfg.task
    y = prepare_target(df[cfg.target], task)

    if cfg.time_col:
        if cfg.test_from is None:
            raise ValueError("--test-from is required with --time-col")
        order = df[cfg.time_col].argsort(kind="stable")
        df, y = df.iloc[order].reset_index(drop=True), y.iloc[order].reset_index(drop=True)
        is_test = df[cfg.time_col] >= cfg.test_from
        train_df, test_df, y_train, y_test = df[~is_test], df[is_test], y[~is_test], y[is_test]
        split = f"time: {cfg.time_col} >= {cfg.test_from}"
    else:
        stratify = y if task == "classification" and y.value_counts().min() >= 2 else None
        train_df, test_df, y_train, y_test = train_test_split(
            df, y, test_size=cfg.test_size, random_state=cfg.seed, stratify=stratify)
        split = f"random {int(cfg.test_size * 100)}% holdout, seed {cfg.seed}"
    if len(test_df) == 0 or len(train_df) < 4:
        raise ValueError(f"not enough rows to train and test: train={len(train_df)} test={len(test_df)}")
    train_df, test_df = train_df.reset_index(drop=True), test_df.reset_index(drop=True)
    y_train, y_test = y_train.reset_index(drop=True), y_test.reset_index(drop=True)

    primary = PRIMARY[task][0]
    cv_results: dict[str, dict] = {}
    best: tuple[str, object, bool] | None = None
    for name, est, scale in candidates(task, cfg.models, cfg.seed):
        fold_scores = []
        for tr, va in _folds(task, cfg, y_train):
            _, _, pred, _ = _fit_predict(est, scale, cfg, features, train_df.iloc[tr], y_train.iloc[tr], train_df.iloc[va])
            fold_scores.append(score(task, y_train.iloc[va], pred))
        mean = {k: float(np.nanmean([s[k] for s in fold_scores])) for k in fold_scores[0]}
        cv_results[name] = mean
        if best is None or _better(task, mean[primary], cv_results[best[0]][primary]):
            best = (name, est, scale)
    assert best is not None
    best_name, best_est, best_scale = best

    model, pre, pred, proba = _fit_predict(best_est, best_scale, cfg, features, train_df, y_train, test_df)
    classes = [str(c) for c in model.classes_] if task == "classification" else None
    test_scores = score(task, y_test, pred, proba, classes)
    dummy = DummyRegressor(strategy="mean") if task == "regression" else DummyClassifier(strategy="most_frequent")
    _, _, base_pred, base_proba = _fit_predict(dummy, False, cfg, features, train_df, y_train, test_df)
    baseline_scores = score(task, y_test, base_pred, base_proba, classes)

    if cfg.refit_all:
        all_df = pd.concat([train_df, test_df], ignore_index=True)
        all_y = pd.concat([y_train, y_test], ignore_index=True)
        pre = Preprocessor(features, scale=best_scale, max_categories=cfg.max_categories, required=cfg.required).fit(all_df)
        model = clone(best_est).fit(pre.transform(all_df), all_y)
        classes = [str(c) for c in model.classes_] if task == "classification" else None

    now = dt.datetime.now(dt.timezone.utc)
    family = best_name.split("(")[0]
    target = {"name": cfg.target, "unit": cfg.unit}
    if classes is not None:
        target["classes"] = classes
    artifact = _clean({
        "schema_version": 1,
        "name": cfg.name or f"{cfg.target}-{family}",
        "version": now.strftime("%Y%m%d-%H%M%S"),
        "kind": cfg.kind,
        "algorithm": f"{type(model).__name__} [{best_name}]",
        "task": task,
        "trained_at": now.isoformat(timespec="seconds"),
        "target": target,
        "features": pre.feature_specs(),
        "columns": pre.columns(),
        "estimator": export_estimator(model, task),
        "metrics": {
            "primary": primary,
            "model": test_scores,
            "baseline": baseline_scores,
            "rows": {"train": len(train_df), "test": len(test_df)},
            "split": split,
            "refit_on_all_rows": cfg.refit_all,
        },
        "importances": importances(model, pre.columns())[:20],
        "meta": {
            "source": cfg.source,
            "as_of": cfg.as_of or now.date().isoformat(),
            "license": cfg.license,
            "generated_at": now.isoformat(timespec="seconds"),
        },
    })
    report = _clean({
        "artifact": {k: artifact[k] for k in ("name", "version", "kind", "algorithm", "task", "metrics", "importances")},
        "cv": {"folds": cfg.cv, "primary": primary, "results": cv_results},
        "chosen": best_name,
        "features": features,
        "confusion_matrix": (
            {"labels": classes, "matrix": confusion_matrix(y_test, pred, labels=classes).tolist()}
            if task == "classification" else None
        ),
    })
    return artifact, report


def write_outputs(artifact: dict, report: dict, out: Path = DEFAULT_OUT) -> tuple[Path, Path]:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    REPORTS.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS / f"{artifact['name']}-{artifact['version']}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
    return out, report_path


def print_summary(artifact: dict, report: dict, out: Path) -> None:
    m = artifact["metrics"]
    primary = m["primary"]
    print(f"task: {artifact['task']}  target: {artifact['target']['name']}  split: {m['split']}")
    print(f"cv ({primary}, mean of folds):")
    for name, scores in sorted(report["cv"]["results"].items(), key=lambda kv: kv[1][primary],
                               reverse=PRIMARY[artifact["task"]][1] == "higher"):
        mark = "  <- chosen" if name == report["chosen"] else ""
        print(f"  {name:22s} " + "  ".join(f"{k}={v:.4f}" for k, v in scores.items()) + mark)
    print("holdout:")
    print("  model    " + "  ".join(f"{k}={v:.4f}" for k, v in m["model"].items() if v is not None))
    print("  baseline " + "  ".join(f"{k}={v:.4f}" for k, v in m["baseline"].items() if v is not None))
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} ({size_kb:.0f} KB){'  WARNING: over 2 MB, reduce trees/depth' if size_kb > 2048 else ''}")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", required=True, help="CSV, TSV, JSON or XLSX file")
    p.add_argument("--target", required=True)
    p.add_argument("--features", help="comma-separated; default: every other column")
    p.add_argument("--task", choices=("auto", "regression", "classification"), default="auto")
    p.add_argument("--models", default=",".join(FAMILIES), help=f"subset of {','.join(FAMILIES)}")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--test-size", type=float, default=0.2)
    p.add_argument("--cv", type=int, default=5)
    p.add_argument("--time-col", help="split by time instead of at random")
    p.add_argument("--test-from", type=float, help="rows with time-col >= this go to the holdout")
    p.add_argument("--no-refit", action="store_true", help="export the model fitted on the training part only")
    p.add_argument("--required", default="", help="comma-separated features the API must receive")
    p.add_argument("--kind", choices=("trained", "fixture"), default="trained")
    p.add_argument("--name")
    p.add_argument("--unit", help="unit of the target, shown next to predictions")
    p.add_argument("--source", default="unspecified")
    p.add_argument("--license", default="unspecified")
    p.add_argument("--as-of")
    p.add_argument("--sep")
    p.add_argument("--decimal")
    p.add_argument("--encoding")
    p.add_argument("--sheet")
    p.add_argument("--out", default=str(DEFAULT_OUT))
    a = p.parse_args(argv)
    df = load_table(a.data, sep=a.sep, decimal=a.decimal, encoding=a.encoding, sheet=a.sheet)
    split = lambda s: [x.strip() for x in s.split(",") if x.strip()] if s else []  # noqa: E731
    cfg = TrainConfig(
        target=a.target, features=split(a.features) or None, task=a.task, models=tuple(split(a.models)),
        seed=a.seed, test_size=a.test_size, cv=a.cv, time_col=a.time_col, test_from=a.test_from,
        refit_all=not a.no_refit, required=split(a.required), kind=a.kind, name=a.name, unit=a.unit,
        source=a.source, license=a.license, as_of=a.as_of,
    )
    artifact, report = run(df, cfg)
    out, report_path = write_outputs(artifact, report, Path(a.out))
    print_summary(artifact, report, out)
    print(f"report {report_path}")


if __name__ == "__main__":
    main()
