import numpy as np

from ml.aq_forecast import extend_cams


def series(n_valid: int, n_total: int) -> np.ndarray:
    """One cell: hour k holds k (so 'the value 24 h earlier' is easy to check), NaN after n_valid hours."""
    x = np.arange(n_total, dtype=float)
    x[n_valid:] = np.nan
    return x[:, None]


def test_trailing_hours_repeat_the_day_before():
    out = extend_cams(series(48, 100))
    assert out[48, 0] == 24 and out[71, 0] == 47      # first day past the end: 24 h earlier
    assert out[72, 0] == 24 and out[99, 0] == 27      # later days: the same last valid day (24..47) again
    assert not np.isnan(out).any()


def test_interior_gaps_and_empty_cells_are_left_alone():
    x = np.hstack([series(48, 72), np.full((72, 1), np.nan)])
    x[10, 0] = np.nan
    out = extend_cams(x)
    assert np.isnan(out[10, 0]) and np.isnan(out[:, 1]).all()


def test_input_is_not_mutated():
    x = series(48, 72)
    extend_cams(x)
    assert np.isnan(x[48:, 0]).all()


def test_short_history_repeats_what_exists():
    out = extend_cams(series(10, 30))                 # less than a day of CAMS: repeat with that period
    assert not np.isnan(out).any() and out[10, 0] == 0 and out[29, 0] == 9
