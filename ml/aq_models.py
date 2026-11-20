"""One interface over LightGBM (CPU) and XGBoost (CUDA on the RTX 4070): fit, predict, SHAP, save, load."""
from __future__ import annotations

from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.aq_features import CATEGORICAL


def xgb_frame(X: pd.DataFrame) -> pd.DataFrame:
    """XGBoost 3 refuses categories unseen in training; the sensor type goes in as a plain number instead."""
    return X.assign(**{c: X[c].astype("float32") for c in CATEGORICAL if c in X})


class Model:
    def __init__(self, algo: str, booster, best_iteration: int | None = None):
        self.algo, self.booster, self.best_iteration = algo, booster, best_iteration

    @property
    def features(self) -> list[str]:
        return list(self.booster.feature_name() if self.algo == "lgbm" else self.booster.feature_names)

    def _cols(self, X: pd.DataFrame) -> pd.DataFrame:
        return X[self.features]

    def _dm(self, X: pd.DataFrame):
        import xgboost as xgb
        return xgb.DMatrix(xgb_frame(X))

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        X = self._cols(X)
        if self.algo == "lgbm":
            return self.booster.predict(X)
        return self.booster.predict(self._dm(X))

    def contrib(self, X: pd.DataFrame) -> np.ndarray:
        """SHAP values per feature of self.features (bias column dropped)."""
        X = self._cols(X)
        if self.algo == "lgbm":
            return self.booster.predict(X, pred_contrib=True)[:, :-1]
        return self.booster.predict(self._dm(X), pred_contribs=True)[:, :-1]

    def gain(self, features: list[str]) -> np.ndarray:
        if self.algo == "lgbm":
            return self.booster.feature_importance("gain")
        score = self.booster.get_score(importance_type="total_gain")
        return np.array([score.get(f, 0.0) for f in features])

    def save(self, path_stem: Path) -> None:
        if self.algo == "lgbm":
            self.booster.save_model(str(path_stem.with_suffix(".txt")))
        else:
            self.booster.save_model(str(path_stem.with_suffix(".json")))

    @staticmethod
    def load(path_stem: Path, algo: str) -> "Model":
        if algo == "lgbm":
            return Model("lgbm", lgb.Booster(model_file=str(path_stem.with_suffix(".txt"))))
        import xgboost as xgb
        b = xgb.Booster()
        b.load_model(str(path_stem.with_suffix(".json")))
        return Model("xgb", b)


def fit_lgbm(params: dict, X, y, Xv, yv, weight=None, weight_v=None, rounds=3000, stop=100) -> Model:
    dtr = lgb.Dataset(X, y, weight=weight, categorical_feature=CATEGORICAL, free_raw_data=False)
    dv = lgb.Dataset(Xv, yv, weight=weight_v, reference=dtr, categorical_feature=CATEGORICAL)
    b = lgb.train(params, dtr, num_boost_round=rounds, valid_sets=[dv],
                  callbacks=[lgb.early_stopping(stop, verbose=False), lgb.log_evaluation(0)])
    return Model("lgbm", b, b.best_iteration)


XGB_OBJECTIVE = {"l1": {"objective": "reg:absoluteerror"}, "l2": {"objective": "reg:squarederror"},
                 "huber": {"objective": "reg:pseudohubererror", "huber_slope": 5.0},
                 "q10": {"objective": "reg:quantileerror", "quantile_alpha": 0.1},
                 "q90": {"objective": "reg:quantileerror", "quantile_alpha": 0.9}}


def fit_xgb(kind: str, X, y, Xv, yv, lr=0.05, depth=8, rounds=3000, stop=100) -> Model:
    import xgboost as xgb
    params = {**XGB_OBJECTIVE[kind], "device": "cuda", "tree_method": "hist", "learning_rate": lr, "max_depth": depth,
              "min_child_weight": 50, "subsample": 0.8, "colsample_bytree": 0.8, "lambda": 5.0, "max_bin": 256}
    dtr = xgb.DMatrix(xgb_frame(X), y)
    dv = xgb.DMatrix(xgb_frame(Xv), yv)
    b = xgb.train(params, dtr, num_boost_round=rounds, evals=[(dv, "val")], early_stopping_rounds=stop,
                  verbose_eval=False)
    best = int(b.best_iteration) + 1
    return Model("xgb", b[:best], best)


def refit_xgb(kind: str, X, y, rounds: int, lr=0.05, depth=8) -> Model:
    import xgboost as xgb
    params = {**XGB_OBJECTIVE[kind], "device": "cuda", "tree_method": "hist", "learning_rate": lr, "max_depth": depth,
              "min_child_weight": 50, "subsample": 0.8, "colsample_bytree": 0.8, "lambda": 5.0, "max_bin": 256}
    return Model("xgb", xgb.train(params, xgb.DMatrix(xgb_frame(X), y), num_boost_round=rounds), rounds)
