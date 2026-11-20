"""The files the live forecast needs that are not in git, as GitHub Release `models-latest` assets.

    uv run --group ml python -u -m ml.aq_release upload      # on the RTX PC, after ml.aq_train (needs gh login)
    uv run --group ml python -u -m ml.aq_release download    # the forecast workflow, at the start of every run

Assets are flat (a release has no folders); FILES maps each one to where the code reads it. Models are the four
aq_* boosters of aq_meta.json's algo (.json for XGBoost, .txt for LightGBM)."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAG = "models-latest"
MODEL_DIR = "ml/models"
FILES = {  # asset name -> folder under ROOT
    "aq_meta.json": MODEL_DIR,
    "aq_sources.json": MODEL_DIR,                      # „Кой замърсява?“ shares (ml.aq_sources)
    "sensors_bg.json": "data/raw/aq",
    "names.json": "data/raw/aq",
    "cells.json": "data/raw/aq",                       # sensor -> weather cell, read by load_sensors()
    "elevation.json": "data/raw/aq",
    "scoreboard_replay.json": "data/processed",        # the replay half of model.scoreboard (ml.aq_scoreboard)
}
MODELS = ("pm25", "pm10", "pm25_q10", "pm25_q90")


def model_files() -> dict[str, str]:
    meta = json.loads((ROOT / MODEL_DIR / "aq_meta.json").read_text(encoding="utf-8"))
    ext = ".json" if meta.get("algo", "lgbm") == "xgb" else ".txt"
    return {f"aq_{m}{ext}": MODEL_DIR for m in MODELS}


def gh(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["gh", *args], check=True, text=True, capture_output=True)


def upload(repo: str | None) -> None:
    files = {**FILES, **model_files()}
    paths = [ROOT / folder / name for name, folder in files.items()]
    missing = [str(p.relative_to(ROOT)) for p in paths if not p.exists()]
    if missing:
        sys.exit(f"missing: {missing}")
    r = ["-R", repo] if repo else []
    if subprocess.run(["gh", "release", "view", TAG, *r], capture_output=True).returncode != 0:
        gh("release", "create", TAG, *r, "--title", "Forecast models (latest)", "--latest=false", "--notes",
           "Models and sensor lists for the hourly forecast workflow (.github/workflows/forecast.yml). "
           "Replaced in place by `python -m ml.aq_release upload` after each retrain; see docs/aq-model.md.")
    gh("release", "upload", TAG, *r, "--clobber", *map(str, paths))
    for p in paths:
        print(f"uploaded {p.relative_to(ROOT)} ({p.stat().st_size / 1e6:.1f} MB)")


def download(repo: str | None) -> None:
    r = ["-R", repo] if repo else []
    with tempfile.TemporaryDirectory() as tmp:
        gh("release", "download", TAG, *r, "-D", tmp, "--clobber")
        got = {p.name: p for p in Path(tmp).iterdir()}
        meta = json.loads(got["aq_meta.json"].read_text(encoding="utf-8"))
        ext = ".json" if meta.get("algo", "lgbm") == "xgb" else ".txt"
        need = {**FILES, **{f"aq_{m}{ext}": MODEL_DIR for m in MODELS}}
        missing = sorted(set(need) - set(got))
        if missing:
            sys.exit(f"release {TAG} lacks {missing}")
        for name, folder in need.items():
            dest = ROOT / folder / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(got[name]), dest)
            print(f"{dest.relative_to(ROOT)} ({dest.stat().st_size / 1e6:.1f} MB)")
    print(f"model {meta.get('name')} ({meta.get('algo')}), trained rows {meta.get('trained_rows')}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["upload", "download"])
    ap.add_argument("-R", "--repo", help="owner/name (default: the current checkout's repo)")
    args = ap.parse_args()
    (upload if args.action == "upload" else download)(args.repo)
