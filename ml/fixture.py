"""Train the placeholder model shipped before the topic is known.

It uses scikit-learn's bundled diabetes toy dataset (no download) and is marked kind="fixture",
so the API and the UI label it as a placeholder. Replace it on the day with `python -m ml.train`.

    uv run --group ml python -m ml.fixture"""
from __future__ import annotations

import pandas as pd
from sklearn.datasets import load_diabetes

from ml.train import TrainConfig, print_summary, run, write_outputs


def diabetes_frame() -> pd.DataFrame:
    """Diabetes toy data (442 rows) with `sex` as a category so one-hot encoding is exercised."""
    df = load_diabetes(scaled=False, as_frame=True).frame.rename(columns={"target": "progression"})
    df["sex"] = df["sex"].map({1.0: "group_1", 2.0: "group_2"})
    return df


def main() -> None:
    cfg = TrainConfig(
        target="progression",
        kind="fixture",
        models=("tree",),  # a single tree, so the UI can show its decision path
        name="fixture-diabetes",
        unit="disease progression score",
        source="scikit-learn diabetes toy dataset (Efron et al., 2004): placeholder, not hackathon data",
        license="BSD-3-Clause (scikit-learn)",
    )
    artifact, report = run(diabetes_frame(), cfg)
    out, report_path = write_outputs(artifact, report)
    print_summary(artifact, report, out)
    print(f"report {report_path}")


if __name__ == "__main__":
    main()
