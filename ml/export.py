"""Export fitted scikit-learn estimators to the JSON shape that web/src/lib/ml/predict.ts evaluates.

Trees: go left when float32(x[feature]) <= threshold (sklearn casts X to float32); leaves have left == -1.
`value` holds leaf outputs only (null for internal nodes): the regression value, or class proportions."""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, LogisticRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

SINGLE_TREES = (DecisionTreeRegressor, DecisionTreeClassifier)
FORESTS = (RandomForestRegressor, RandomForestClassifier, ExtraTreesRegressor, ExtraTreesClassifier)
BOOSTED = (GradientBoostingRegressor, GradientBoostingClassifier)
LINEAR_REGRESSORS = (LinearRegression, Ridge, Lasso, ElasticNet)
SUPPORTED = SINGLE_TREES + FORESTS + BOOSTED + LINEAR_REGRESSORS + (LogisticRegression,)


def _tree(est, proportions: bool) -> dict:
    t = est.tree_
    left = t.children_left.tolist()
    values = t.value[:, 0, :]
    out_values: list[list[float] | None] = []
    for node, row in enumerate(values):
        if left[node] != -1:
            out_values.append(None)
            continue
        row = np.asarray(row, dtype=np.float64)
        if proportions:
            total = row.sum()
            row = row / total if total > 0 else row
        out_values.append(row.tolist())
    return {
        "feature": t.feature.tolist(),
        "threshold": t.threshold.tolist(),
        "left": left,
        "right": t.children_right.tolist(),
        "value": out_values,
    }


def _boost_base(est) -> list[float]:
    x0 = np.zeros((1, est.n_features_in_), dtype=np.float64)
    try:
        raw = np.asarray(est._raw_predict_init(x0), dtype=np.float64)[0]
    except AttributeError:  # private API moved: recover the start value from public predictions
        raw_total = est.predict(x0) if isinstance(est, GradientBoostingRegressor) else est.decision_function(x0)
        raw_total = np.atleast_1d(np.asarray(raw_total, dtype=np.float64)[0])
        stages = est.estimators_
        raw = np.array([
            raw_total[k] - est.learning_rate * sum(stages[i, k].predict(x0.astype(np.float32))[0]
                                                   for i in range(stages.shape[0]))
            for k in range(stages.shape[1])
        ])
    return np.atleast_1d(raw).astype(np.float64).tolist()


def export_estimator(est, task: str) -> dict:
    classification = task == "classification"
    if isinstance(est, SINGLE_TREES + FORESTS):
        trees = [est] if isinstance(est, SINGLE_TREES) else list(est.estimators_)
        return {
            "type": "trees",
            "combine": "mean",
            "outputs": len(est.classes_) if classification else 1,
            "link": "proba" if classification else "identity",
            "trees": [_tree(t, classification) for t in trees],
        }
    if isinstance(est, BOOSTED):
        stages = est.estimators_
        k = stages.shape[1]
        link = "identity" if not classification else ("sigmoid" if k == 1 else "softmax")
        return {
            "type": "trees",
            "combine": "boost",
            "outputs": k,
            "link": link,
            "learning_rate": float(est.learning_rate),
            "base": _boost_base(est),
            "trees": [_tree(stages[i, j], False) for i in range(stages.shape[0]) for j in range(k)],
        }
    if isinstance(est, LINEAR_REGRESSORS):
        return {
            "type": "linear",
            "link": "identity",
            "coef": [np.ravel(est.coef_).astype(np.float64).tolist()],
            "intercept": [float(np.ravel([est.intercept_])[0])],
        }
    if isinstance(est, LogisticRegression):
        coef = np.atleast_2d(est.coef_).astype(np.float64)
        return {
            "type": "linear",
            "link": "sigmoid" if coef.shape[0] == 1 else "softmax",
            "coef": coef.tolist(),
            "intercept": np.ravel(est.intercept_).astype(np.float64).tolist(),
        }
    raise TypeError(f"{type(est).__name__} cannot be exported; supported: {[c.__name__ for c in SUPPORTED]}")


def importances(est, columns: list[dict]) -> list[dict]:
    """Importance per source feature (one-hot columns summed), normalised to 1, largest first."""
    if hasattr(est, "feature_importances_"):
        raw = np.asarray(est.feature_importances_, dtype=np.float64)
    elif hasattr(est, "coef_"):
        raw = np.abs(np.atleast_2d(est.coef_)).mean(axis=0)
    else:
        return []
    by_feature: dict[str, float] = {}
    for col, value in zip(columns, raw):
        by_feature[col["feature"]] = by_feature.get(col["feature"], 0.0) + float(value)
    total = sum(by_feature.values()) or 1.0
    ranked = sorted(by_feature.items(), key=lambda kv: kv[1], reverse=True)
    return [{"feature": f, "value": v / total} for f, v in ranked]
