import pandas as pd

from ml.preprocess import OTHER, Preprocessor


def test_median_impute_and_one_hot():
    df = pd.DataFrame({"x": [1.0, 2.0, None, 10.0], "c": ["a", "b", "a", None]})
    pre = Preprocessor(["x", "c"]).fit(df)
    assert pre.specs[0]["impute"] == 2.0
    assert pre.specs[1]["impute"] == "a"
    x = pre.transform(pd.DataFrame({"x": [None, 4.0], "c": ["b", None]}))
    assert x.tolist() == [[2.0, 0.0, 1.0], [4.0, 1.0, 0.0]]


def test_scaling_uses_population_std():
    pre = Preprocessor(["x"], scale=True).fit(pd.DataFrame({"x": [1.0, 3.0]}))
    assert pre.cols[0]["center"] == 2.0 and pre.cols[0]["scale"] == 1.0
    assert pre.transform(pd.DataFrame({"x": [5.0]})).tolist() == [[3.0]]


def test_top_categories_and_other_bucket():
    df = pd.DataFrame({"c": ["a"] * 5 + ["b"] * 3 + ["c", "d"]})
    pre = Preprocessor(["c"], max_categories=2).fit(df)
    assert pre.specs[0]["categories"] == ["a", "b", OTHER]
    x = pre.transform(pd.DataFrame({"c": ["zzz", "d", None, " b "]}))
    assert x.tolist() == [[0, 0, 1], [0, 0, 1], [1, 0, 0], [0, 1, 0]]


def test_unseen_category_without_other_bucket_is_all_zero():
    pre = Preprocessor(["c"]).fit(pd.DataFrame({"c": ["a", "b"]}))
    assert pre.transform(pd.DataFrame({"c": ["zzz"]})).tolist() == [[0.0, 0.0]]


def test_missing_column_is_imputed():
    pre = Preprocessor(["x", "c"]).fit(pd.DataFrame({"x": [1.0, 3.0], "c": ["a", "a"]}))
    assert pre.transform(pd.DataFrame({"x": [7.0]})).tolist() == [[7.0, 1.0]]
