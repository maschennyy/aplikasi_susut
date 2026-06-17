"""Authentication, CSRF, session, and login rate-limit helpers."""

import secrets
from collections import defaultdict, deque
from datetime import datetime, timedelta

from flask import current_app, request, session

from ..models import User, db
from .security import audit, client_ip


LOGIN_FAILURES = defaultdict(deque)
LOGIN_LOCKOUTS = {}


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def ensure_csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def csrf_token():
    return ensure_csrf_token()


def validate_csrf():
    expected = session.get("csrf_token")
    supplied = (
        request.headers.get("X-CSRFToken")
        or request.headers.get("X-CSRF-Token")
        or request.form.get("csrf_token")
    )
    return bool(expected and supplied and secrets.compare_digest(expected, supplied))


def login_user(user):
    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    session["username"] = user.username
    session["role"] = user.role
    ensure_csrf_token()
    user.last_login_at = datetime.utcnow()


def logout_user():
    session.clear()


def _prune_events(events, window_minutes):
    cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)
    while events and events[0] < cutoff:
        events.popleft()


def _rate_limited(bucket, key, limit, window_minutes):
    events = bucket[key]
    _prune_events(events, window_minutes)
    return len(events) >= limit


def _record_rate_event(bucket, key, window_minutes):
    events = bucket[key]
    _prune_events(events, window_minutes)
    events.append(datetime.utcnow())


def login_rate_key(username):
    return f'{client_ip()}:{(username or "").lower()}'


def is_login_locked(key):
    until = LOGIN_LOCKOUTS.get(key)
    if not until:
        return False
    if until <= datetime.utcnow():
        LOGIN_LOCKOUTS.pop(key, None)
        return False
    return True


def login_rate_limited(key):
    return _rate_limited(
        LOGIN_FAILURES,
        key,
        current_app.config.get("LOGIN_RATE_LIMIT", 5),
        current_app.config.get("LOGIN_RATE_WINDOW_MINUTES", 15),
    )


def record_login_failure(key):
    _record_rate_event(
        LOGIN_FAILURES,
        key,
        current_app.config.get("LOGIN_RATE_WINDOW_MINUTES", 15),
    )


def clear_login_failures(key):
    LOGIN_FAILURES.pop(key, None)


def lock_login(key):
    LOGIN_LOCKOUTS[key] = datetime.utcnow() + timedelta(
        minutes=current_app.config.get("LOGIN_LOCKOUT_MINUTES", 15)
    )


def safe_commit_audit(action, detail=None, status="SUCCESS", username=None):
    try:
        audit(action, detail=detail, status=status, username=username)
        db.session.commit()
    except Exception:
        db.session.rollback()
