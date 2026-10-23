from __future__ import annotations

import os
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]

# Resolve the test database from the same .env credentials while never touching
# the development database. Set APP_ENV before importing application modules so
# settings validate and log in test mode.
_env = dotenv_values(BACKEND_DIR / ".env")
_database_url = _env.get("DATABASE_URL")
if not _database_url:
    raise RuntimeError("DATABASE_URL is required in backend/.env for integration tests")
_test_url = make_url(_database_url).set(
    database=os.getenv("TEST_DATABASE_NAME", "hr_assist_test")
)
os.environ["DATABASE_URL"] = _test_url.render_as_string(hide_password=False)
os.environ["APP_ENV"] = "test"
os.environ["DEBUG"] = "false"
os.environ["DATABASE_ECHO"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ.setdefault("TRUSTED_HOSTS", "localhost,127.0.0.1,testserver")

from fastapi.testclient import TestClient  # noqa: E402

from app.db.audit_guard import install_audit_guard  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.seed import seed  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

SEED_PASSWORD = os.getenv("SEED_PASSWORD", "LocalDevOnly!123")


@pytest.fixture(autouse=True)
def database():
    """Create an isolated, seeded PostgreSQL schema for every test.

    PostgreSQL (not SQLite) is used deliberately so JSONB, constraints, UUIDs,
    triggers, and state transitions behave like the target environment.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        install_audit_guard(connection)
    with SessionLocal() as db:
        seed(db, include_sample_data=False)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def login(client):
    cache: dict[str, dict[str, str]] = {}

    def _login(email: str, password: str = SEED_PASSWORD) -> dict[str, str]:
        if email in cache:
            return cache[email]
        response = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 200, response.text
        cache[email] = {
            "Authorization": f"Bearer {response.json()['access_token']}"
        }
        return cache[email]

    return _login
