"""Shared constants for backend application configuration.

This module keeps static security, role, workflow, and upload constants out of
``app.py`` so the Flask entrypoint can stay focused on application wiring.
"""

SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}

PUBLIC_ENDPOINTS = {
    'login',
    'api_csrf_token',
    'auth.login',
    'auth.api_csrf_token',
}

WRITE_ROLES = {'admin', 'operator'}

ALLOWED_GENERIC_UPLOADS = {'csv', 'xlsx', 'xlsm', 'xls'}
ALLOWED_NKWH_UPLOADS = {'xlsx', 'xlsm'}
XLS_SIGNATURE = bytes.fromhex('d0cf11e0a1b11ae1')

ROLES = {'admin', 'operator', 'viewer', 'auditor'}

MODULE_ACCESS_MATRIX = [
    {
        'module': 'Dashboard',
        'group': 'Dashboard',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'export': ['auditor', 'operator', 'admin'],
        },
    },
    {
        'module': 'Gardu Induk',
        'group': 'Gardu Induk',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'write': ['operator', 'admin'],
            'export': ['auditor', 'operator', 'admin'],
            'finalize': ['operator', 'admin'],
            'lock': ['admin'],
        },
    },
    {
        'module': 'UID',
        'group': 'UID',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'write': ['operator', 'admin'],
            'export': ['auditor', 'operator', 'admin'],
        },
    },
    {
        'module': 'Master Data',
        'group': 'Master',
        'access': {
            'read': ['operator', 'admin'],
            'write': ['operator', 'admin'],
            'audit': ['admin'],
        },
    },
    {
        'module': 'Rekap kWh',
        'group': 'Master',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'export': ['auditor', 'operator', 'admin'],
        },
    },
    {
        'module': 'Transaksi',
        'group': 'Transaksi',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'write': ['operator', 'admin'],
        },
    },
    {
        'module': 'Security',
        'group': 'Admin',
        'access': {
            'read': ['admin'],
            'write': ['admin'],
            'audit': ['admin'],
        },
    },
    {
        'module': 'Profile',
        'group': 'Akun',
        'access': {
            'read': ['viewer', 'auditor', 'operator', 'admin'],
            'self_update': ['viewer', 'auditor', 'operator', 'admin'],
        },
    },
]

WORKFLOW_STATUS_ORDER = ['DRAFT', 'SUDAH_UPLOAD', 'SUDAH_DICEK', 'FINAL', 'TERKUNCI']

WORKFLOW_STATUS_LABELS = {
    'DRAFT': 'Draft',
    'SUDAH_UPLOAD': 'Sudah Upload',
    'SUDAH_DICEK': 'Sudah Dicek',
    'FINAL': 'Final',
    'TERKUNCI': 'Terkunci',
}

WORKFLOW_TRANSITIONS = {
    'DRAFT': ['DRAFT', 'SUDAH_UPLOAD'],
    'SUDAH_UPLOAD': ['DRAFT', 'SUDAH_UPLOAD', 'SUDAH_DICEK'],
    'SUDAH_DICEK': ['SUDAH_UPLOAD', 'SUDAH_DICEK', 'FINAL'],
    'FINAL': ['SUDAH_DICEK', 'FINAL', 'TERKUNCI'],
    'TERKUNCI': ['TERKUNCI', 'FINAL'],
}

WORKFLOW_WRITABLE_STATUSES = {'DRAFT', 'SUDAH_UPLOAD'}

MONTHLY_ACTIVITY_ACTIONS = [
    'ANALYZE_NKWH',
    'IMPORT_NKWH',
    'IMPORT_PENYULANG',
    'MARK_MONTH_UPLOADED',
    'UPDATE_MONTHLY_STATUS',
]

KWH_JUAL_GROUP_LABELS = {
    'S': 'Sosial',
    'R': 'Rumah Tangga',
    'B': 'Bisnis',
    'I': 'Industri',
    'P': 'Pemerintah',
    'TCL': 'T/C/L Khusus',
}
