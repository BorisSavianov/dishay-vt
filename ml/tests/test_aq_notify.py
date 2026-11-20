import sys
import types

import httpx

# notify_telegram needs no model. LightGBM cannot load on a Mac without Homebrew's libomp, so stub it there.
try:
    import lightgbm  # noqa: F401
except OSError:
    sys.modules["lightgbm"] = types.ModuleType("lightgbm")

from ml import aq_forecast  # noqa: E402


def env(values):
    return lambda key: values.get(key)


def test_skips_without_env(monkeypatch):
    calls = []
    monkeypatch.setattr(aq_forecast, "env_value", env({"TG_NOTIFY_URL": "https://x/api/telegram/notify"}))
    aq_forecast.notify_telegram(post=lambda *a, **k: calls.append((a, k)))
    assert calls == []


def test_posts_with_bearer_and_timeout(monkeypatch):
    calls = []

    class Res:
        text = '{"ok":true,"sent":1}'

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return Res()

    monkeypatch.setattr(aq_forecast, "env_value",
                        env({"TG_NOTIFY_URL": "https://x/api/telegram/notify", "TELEGRAM_NOTIFY_SECRET": "s3"}))
    aq_forecast.notify_telegram(post=post)
    assert calls == [("https://x/api/telegram/notify", {"headers": {"Authorization": "Bearer s3"}, "timeout": 10})]


def test_network_error_does_not_propagate(monkeypatch):
    def post(url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(aq_forecast, "env_value",
                        env({"TG_NOTIFY_URL": "https://x/api/telegram/notify", "TELEGRAM_NOTIFY_SECRET": "s3"}))
    aq_forecast.notify_telegram(post=post)  # no exception


def test_env_value_reads_env_local(tmp_path, monkeypatch):
    (tmp_path / "web").mkdir()
    (tmp_path / "web" / ".env.local").write_text('DATABASE_URL=postgres://a\nTG_NOTIFY_URL="https://x/n"\n# c\n')
    monkeypatch.setattr(aq_forecast, "ROOT", tmp_path)
    assert aq_forecast.env_value("DATABASE_URL") == "postgres://a"
    assert aq_forecast.env_value("TG_NOTIFY_URL") == "https://x/n"
    assert aq_forecast.env_value("MISSING") is None
    assert aq_forecast.database_url() == "postgres://a"
