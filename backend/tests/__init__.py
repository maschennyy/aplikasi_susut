import os

os.environ["APP_ENV"] = "test"
os.environ.setdefault("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("TEST_SECRET_KEY", "backend-test-secret")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
os.environ.setdefault("SECURITY_REQUIRE_LOGIN", "false")
