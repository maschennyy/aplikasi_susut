"""Reusable audit-log helpers for transactional services."""

from __future__ import annotations

from dataclasses import dataclass
import json

from ..models import AuditLog, db


@dataclass(frozen=True)
class AuditActor:
    user_id: int | None
    username: str | None
    role: str | None
    ip_address: str
    user_agent: str


def add_audit_log(
    *,
    actor: AuditActor,
    action: str,
    entity_type: str | None = None,
    entity_id: int | str | None = None,
    detail: dict | None = None,
    status: str = "SUCCESS",
) -> AuditLog:
    """Add an audit record to the active SQLAlchemy transaction."""
    record = AuditLog(
        user_id=actor.user_id,
        username=actor.username,
        role=actor.role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        status=status,
        ip_address=actor.ip_address,
        user_agent=actor.user_agent[:255],
        detail_json=json.dumps(detail or {}, ensure_ascii=False),
    )
    db.session.add(record)
    return record
