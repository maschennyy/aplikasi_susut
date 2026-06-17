"""Role and module-access helpers."""

from .constants import MODULE_ACCESS_MATRIX, ROLES


def module_access_payload(role=None):
    """Return module permissions, optionally resolved for one role."""
    normalized_role = (role or "").strip().lower()
    rows = []

    for item in MODULE_ACCESS_MATRIX:
        access = item["access"]
        row = {
            "module": item["module"],
            "group": item["group"],
            "access": access,
        }
        if normalized_role in ROLES:
            row["role"] = normalized_role
            row["allowed_actions"] = [
                action
                for action, allowed_roles in access.items()
                if normalized_role in allowed_roles
            ]
        rows.append(row)

    return rows
