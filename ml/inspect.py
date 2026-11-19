"""First look at a dataset: shape, column types, missing values, and which columns could be a target.

    uv run --group ml python -m ml.inspect data/raw/x.csv [--sep ';'] [--encoding cp1251] [--sheet 0]"""
from __future__ import annotations

import argparse

import pandas as pd

from ml.data import load_table
from ml.preprocess import is_number_column


def describe(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for col in df.columns:
        s = df[col]
        numeric = is_number_column(s)
        rows.append({
            "column": col,
            "type": "number" if numeric else "category",
            "missing_%": round(100 * s.isna().mean(), 1),
            "unique": int(s.nunique(dropna=True)),
            "min": s.min() if numeric and s.notna().any() else "",
            "median": s.median() if numeric and s.notna().any() else "",
            "max": s.max() if numeric and s.notna().any() else "",
            "examples": ", ".join(str(v) for v in s.dropna().unique()[:3]),
        })
    return pd.DataFrame(rows)


def target_hints(df: pd.DataFrame) -> list[str]:
    hints = []
    for col in df.columns:
        s = df[col].dropna()
        if s.empty:
            continue
        if is_number_column(s) and s.nunique() > 10:
            hints.append(f"{col}: regression (continuous, {s.nunique()} distinct values)")
        elif 2 <= s.nunique() <= 20:
            counts = s.value_counts(normalize=True)
            hints.append(f"{col}: classification ({s.nunique()} classes, largest {counts.iloc[0]:.0%})")
    return hints


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("path")
    p.add_argument("--sep")
    p.add_argument("--decimal")
    p.add_argument("--encoding")
    p.add_argument("--sheet")
    a = p.parse_args(argv)
    df = load_table(a.path, sep=a.sep, decimal=a.decimal, encoding=a.encoding, sheet=a.sheet)
    print(f"{a.path}: {len(df)} rows x {len(df.columns)} columns, {int(df.duplicated().sum())} duplicate rows\n")
    with pd.option_context("display.max_rows", 200, "display.max_columns", 20, "display.width", 200,
                           "display.max_colwidth", 40):
        print(describe(df).to_string(index=False))
        print("\nfirst rows:")
        print(df.head(5).to_string())
    print("\npossible targets:")
    for hint in target_hints(df):
        print(f"  {hint}")


if __name__ == "__main__":
    main()
