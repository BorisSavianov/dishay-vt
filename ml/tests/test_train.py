import json

import numpy as np
import pandas as pd

from ml.fixture import diabetes_frame
from ml.parity import iris_frame
from ml.train import TrainConfig, run

ARTIFACT_KEYS = {"schema_version", "name", "version", "kind", "algorithm", "task", "trained_at", "target",
                 "features", "columns", "estimator", "metrics", "importances", "meta"}


def test_fixture_regression_beats_baseline_and_is_valid_json():
    artifact, report = run(diabetes_frame(), TrainConfig(target="progression", kind="fixture", models=("tree", "linear"), cv=3))
    assert ARTIFACT_KEYS <= artifact.keys()
    assert artifact["task"] == "regression"
    assert artifact["kind"] == "fixture"
    assert artifact["metrics"]["model"]["mae"] < artifact["metrics"]["baseline"]["mae"]
    assert report["chosen"] in report["cv"]["results"]
    json.dumps(artifact, allow_nan=False)


def test_iris_classification_exports_string_classes():
    artifact, report = run(iris_frame(), TrainConfig(target="species", models=("tree",), cv=3))
    assert artifact["task"] == "classification"
    assert artifact["target"]["classes"] == ["setosa", "versicolor", "virginica"]
    assert artifact["metrics"]["model"]["accuracy"] > 0.8
    assert report["confusion_matrix"]["labels"] == artifact["target"]["classes"]


def test_numeric_binary_target_is_classification_with_string_labels():
    df = pd.DataFrame({"x": np.arange(40.0), "y": [0, 1] * 20})
    artifact, _ = run(df, TrainConfig(target="y", models=("tree",), cv=2))
    assert artifact["task"] == "classification"
    assert artifact["target"]["classes"] == ["0", "1"]


def test_time_split_holds_out_the_latest_rows():
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"year": np.arange(2000, 2040), "x": rng.normal(size=40)})
    df["value"] = df["year"] * 2.0 + df["x"]
    artifact, _ = run(df, TrainConfig(target="value", models=("linear",), time_col="year", test_from=2035, cv=3))
    assert artifact["metrics"]["rows"] == {"train": 35, "test": 5}
    assert artifact["metrics"]["split"].startswith("time")
