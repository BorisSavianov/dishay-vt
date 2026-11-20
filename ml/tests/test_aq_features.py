import numpy as np
import pandas as pd

from ml.aq_features import (FEATURES, WEATHER, Panel, derive, features, flatline_mask, humidity_factor,
                            mask_short_lags, targets)

OBS = [f for f in FEATURES if f.startswith(("pm25_", "pm10_", "nb_")) or f == "obs_vs_cams"]


def panel(n_hours=200, n_sensors=3, seed=0) -> Panel:
    rng = np.random.default_rng(seed)
    times = pd.date_range("2025-11-01", periods=n_hours, freq="h", tz="UTC")
    sensors = pd.DataFrame({"id": range(n_sensors), "type": "SDS011", "lat": [43.07, 43.08, 43.3][:n_sensors],
                            "lon": [25.62, 25.63, 25.9][:n_sensors], "cell": "43.00_25.50", "elevation": 220.0,
                            "type_code": 0})
    p25 = rng.uniform(5, 80, (n_hours, n_sensors)).astype(np.float32)
    weather = {v: rng.uniform(0, 100, (n_hours, 1)).astype(np.float32) for v in WEATHER}
    nb = np.array([[0, 1, 0], [1, 0, 0], [0, 0, 0]], dtype=np.float32)[:n_sensors, :n_sensors]
    return Panel(times, sensors, p25, p25 * 1.5, p25.copy(), ["43.00_25.50"], weather,
                 rng.uniform(5, 40, (n_hours, 1)).astype(np.float32), rng.uniform(5, 60, (n_hours, 1)).astype(np.float32),
                 np.zeros(n_sensors, dtype=int), nb)


def test_humidity_factor_only_above_reference():
    f = humidity_factor(np.array([40.0, 79.0, 85.0, 95.0, 100.0, np.nan]))
    assert f[0] == 1.0 and f[1] == 1.0 and f[5] == 1.0
    assert 1.0 < f[2] < f[3] and f[3] == f[4]  # capped at 95 %


def test_flatline_marks_whole_run():
    x = np.array([[1.0], [5.0], [5.0], [5.0], [5.0], [5.0], [5.0], [7.0]], dtype=np.float32)
    m = flatline_mask(x)[:, 0]
    assert not m[0] and m[1:7].all() and not m[7]


def test_observation_features_never_read_after_issue():
    p = panel()
    d = derive(p)
    i = np.array([100, 100, 120]); s = np.array([0, 1, 0]); h = np.array([1, 24, 72])
    before = features(p, d, i, s, h)
    # Scramble every observation after hour 100 for sensor 0/1, and after 120 too.
    p.pm25[101:] = 999.0
    p.pm10[101:] = 999.0
    d2 = derive(p)
    after = features(p, d2, i, s, h)
    pd.testing.assert_frame_equal(before.loc[:1, OBS], after.loc[:1, OBS])


def test_targets_and_shapes():
    p = panel()
    d = derive(p)
    i = np.array([10, 150]); s = np.array([2, 1]); h = np.array([5, 72])
    X = features(p, d, i, s, h)
    assert list(X.columns) == FEATURES and len(X) == 2
    y25, _ = targets(p, i, s, h)
    assert y25[0] == p.pm25[15, 2] and np.isnan(y25[1])  # 150 + 72 is past the panel
    assert X["pm25_lag1"].iloc[0] == p.pm25[10, 2]
    assert X["nb_pm25_lag1"].iloc[1] == p.pm25[150, 0]  # sensor 1's only neighbour is sensor 0


def test_masking_only_hides_short_lags():
    p = panel()
    X = features(p, derive(p), np.full(500, 60), np.zeros(500, dtype=int), np.full(500, 3))
    M = mask_short_lags(X, np.random.default_rng(1), rate=0.5)
    assert M["pm25_lag6"].isna().mean() > 0.3
    assert M["pm25_lag1"].notna().all() and M["pm25_lag24"].notna().all()


def test_spike_filter_drops_broken_sensor_keeps_real_episode():
    from ml.aq_features import spike_filter
    n = 100
    sensors = pd.DataFrame({"lat": [43.07, 43.075, 43.08, 43.085], "lon": [25.62, 25.62, 25.63, 25.62]})
    p25 = np.full((n, 4), 10.0, dtype=np.float32)
    p25[:, 3] = 600.0                 # stuck high: broken
    p25[50:60, :3] = 150.0            # a real smog episode everywhere: kept
    p10 = p25 * 1.5
    bad = spike_filter(p25, p10, sensors)
    assert bad.tolist() == [False, False, False, True]
    assert np.isnan(p25[:50, 3]).all()  # flagged hours blanked; build_panel then drops the whole sensor
    assert (p25[50:60, :3] == 150.0).all()


def test_spike_filter_drops_sensor_stuck_low():
    from ml.aq_features import spike_filter
    sensors = pd.DataFrame({"lat": [43.07, 43.075, 43.08, 43.085], "lon": [25.62, 25.62, 25.63, 25.62]})
    p25 = np.full((100, 4), 40.0, dtype=np.float32)
    p25[:, 3] = 0.6
    assert spike_filter(p25, p25 * 1.5, sensors).tolist() == [False, False, False, True]
