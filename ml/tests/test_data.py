import json

from ml.data import load_table


def test_bulgarian_csv_semicolon_decimal_comma_cp1251(tmp_path):
    path = tmp_path / "bg.csv"
    text = "Област;Население;Дял\nВелико Търново;200 413;12,5\nСофия;1 200 000;30,1\n"
    path.write_bytes(text.encode("cp1251"))
    df = load_table(path)
    assert list(df.columns) == ["Област", "Население", "Дял"]
    assert df["Население"].tolist() == [200413.0, 1200000.0]
    assert df["Дял"].tolist() == [12.5, 30.1]
    assert df["Област"].tolist()[0] == "Велико Търново"


def test_comma_csv_keeps_text_columns(tmp_path):
    path = tmp_path / "x.csv"
    path.write_text("name,value,code\na,1.5,X1\nb,2,X2\n", encoding="utf-8")
    df = load_table(path)
    assert df["value"].tolist() == [1.5, 2.0]
    assert df["code"].tolist() == ["X1", "X2"]


def test_json_object_holding_records(tmp_path):
    path = tmp_path / "x.json"
    path.write_text(json.dumps({"meta": {}, "data": [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]}), encoding="utf-8")
    df = load_table(path)
    assert df.shape == (2, 2)
    assert df["a"].tolist() == [1, 2]
