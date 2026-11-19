"""Load CSV, TSV, JSON and XLSX files into a DataFrame. Handles Bulgarian open-data quirks:
`;` separators, decimal commas, spaces as thousands separators and cp1251 encoding."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ENCODINGS = ("utf-8-sig", "cp1251")
SEPARATORS = (",", ";", "\t", "|")


def _sniff_separator(text: str) -> str:
    lines = [line for line in text.splitlines()[:20] if line.strip()]
    if not lines:
        return ","
    return max(SEPARATORS, key=lambda s: sum(line.count(s) for line in lines))


def _read_text(path: Path, encoding: str | None) -> tuple[str, str]:
    for enc in (encoding,) if encoding else ENCODINGS:
        try:
            return path.read_text(encoding=enc), enc
        except UnicodeDecodeError:
            continue
    raise ValueError(f"{path}: not readable as {', '.join(ENCODINGS)}; pass encoding=")


def _to_number(value: object) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip().replace(" ", "").replace(" ", "")
    if text == "":
        return None
    if text.count(",") == 1 and "." not in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def coerce_numeric(df: pd.DataFrame, min_share: float = 0.9) -> pd.DataFrame:
    """Convert text columns to numbers when at least `min_share` of the non-empty values parse."""
    out = df.copy()
    for col in out.columns:
        s = out[col]
        if pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
            continue
        non_null = s.dropna()
        non_null = non_null[non_null.astype(str).str.strip() != ""]
        if non_null.empty:
            continue
        parsed = non_null.map(_to_number)
        if parsed.notna().mean() >= min_share:
            out[col] = s.map(_to_number).astype("float64")
    return out


def _from_json(path: Path) -> pd.DataFrame:
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(obj, list):
        return pd.json_normalize(obj)
    if isinstance(obj, dict):
        for value in obj.values():
            if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
                return pd.json_normalize(value)
        return pd.DataFrame(obj)
    raise ValueError(f"{path}: JSON must be a list of records or an object holding one")


def load_table(
    path: str | Path,
    sep: str | None = None,
    decimal: str | None = None,
    encoding: str | None = None,
    sheet: str | int | None = None,
) -> pd.DataFrame:
    """Read a tabular file. Text columns that are really numbers become float columns."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".xlsx", ".xlsm", ".xls"):
        df = pd.read_excel(path, sheet_name=sheet if sheet is not None else 0)
    elif suffix == ".json":
        df = _from_json(path)
    else:
        text, enc = _read_text(path, encoding)
        sep = sep or ("\t" if suffix == ".tsv" else _sniff_separator(text))
        decimal = decimal or ("," if sep == ";" else ".")
        df = pd.read_csv(path, sep=sep, decimal=decimal, encoding=enc)
    df.columns = [str(c).strip() for c in df.columns]
    return coerce_numeric(df)
