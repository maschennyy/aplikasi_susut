"""
app.py v5 — Aplikasi Susut Energi
Semua route yang direferensikan di base.html sudah ada.
"""

from flask import (Flask, abort, g, jsonify, redirect, render_template,
                   request, session, url_for)
from config import Config
from models import (db, GarduInduk, Trafo, Penyulang,
                    MeterReading, FeederReading,
                    TransferAntarUnit, RekapBulanan,
                    EximRule, EximMonthlyResult,
                    User, AuditLog)
from nkwh_excel import analyze_workbook, parse_nkwh_feeders, parse_exim_rows
from sqlalchemy import func, text, inspect
from sqlalchemy import and_
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import wraps
from werkzeug.utils import secure_filename
import click
import json
import pandas as pd
import secrets
import os

app = Flask(__name__)
app.config.from_object(Config)
Config.validate()
app.permanent_session_lifetime = timedelta(hours=app.config.get('PERMANENT_SESSION_HOURS', 8))
db.init_app(app)

with app.app_context():
    db.create_all()
    inspector = inspect(db.engine)
    table_columns = {
        table: {col['name'] for col in inspector.get_columns(table)}
        for table in inspector.get_table_names()
    }
    schema_additions = {
        'penyulang': [
            ('area_up3', 'VARCHAR(100)'),
            ('ex_cabang', 'VARCHAR(50)'),
            ('status', "VARCHAR(30) DEFAULT 'AKTIF'"),
        ],
        'feeder_reading': [
            ('deviasi_persen', 'NUMERIC(8, 2)'),
            ('anomaly_type', 'VARCHAR(30)'),
            ('wbp_stand_awal', 'NUMERIC(15, 2)'),
            ('wbp_stand_akhir', 'NUMERIC(15, 2)'),
            ('wbp_faktor_kali', 'NUMERIC(10, 2)'),
            ('lwbp1_stand_awal', 'NUMERIC(15, 2)'),
            ('lwbp1_stand_akhir', 'NUMERIC(15, 2)'),
            ('lwbp1_faktor_kali', 'NUMERIC(10, 2)'),
            ('lwbp2_stand_awal', 'NUMERIC(15, 2)'),
            ('lwbp2_stand_akhir', 'NUMERIC(15, 2)'),
            ('lwbp2_faktor_kali', 'NUMERIC(10, 2)'),
            ('manual_kwh_wbp', 'NUMERIC(15, 2)'),
            ('manual_kwh_lwbp1', 'NUMERIC(15, 2)'),
            ('manual_kwh_lwbp2', 'NUMERIC(15, 2)'),
            ('source_format', 'VARCHAR(30)'),
            ('source_sheet', 'VARCHAR(80)'),
            ('source_row_start', 'INTEGER'),
            ('source_row_end', 'INTEGER'),
        ],
    }
    for table, columns in schema_additions.items():
        existing = table_columns.get(table, set())
        for column_name, ddl in columns:
            if column_name not in existing:
                db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {column_name} {ddl}'))
    if User.query.count() == 0:
        admin_username = os.getenv('ADMIN_USERNAME')
        admin_password = os.getenv('ADMIN_PASSWORD')
        if admin_username and admin_password:
            admin = User(
                username=admin_username.strip(),
                nama_lengkap=os.getenv('ADMIN_NAME', 'Administrator'),
                email=os.getenv('ADMIN_EMAIL'),
                role='admin',
                aktif=True,
            )
            admin.set_password(admin_password)
            db.session.add(admin)
    db.session.commit()


# ════════════════════════════════════════════════
# HALAMAN — semua route yang ada di sidebar
# ════════════════════════════════════════════════

SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}
PUBLIC_ENDPOINTS = {'login', 'static'}
WRITE_ROLES = {'admin', 'operator'}
ALLOWED_GENERIC_UPLOADS = {'csv', 'xlsx', 'xlsm', 'xls'}
ALLOWED_NKWH_UPLOADS = {'xlsx', 'xlsm'}
XLS_SIGNATURE = bytes.fromhex('d0cf11e0a1b11ae1')
LOGIN_FAILURES = defaultdict(deque)
LOGIN_LOCKOUTS = {}
UPLOAD_EVENTS = defaultdict(deque)
ROLES = {'admin', 'operator', 'viewer', 'auditor'}


def _json_error(message, status=400):
    return jsonify({'error': message}), status


def _wants_json():
    return request.path.startswith('/api/') or request.accept_mimetypes.best == 'application/json'


def _client_ip():
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'


def _current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return db.session.get(User, user_id)


def _ensure_csrf_token():
    token = session.get('csrf_token')
    if not token:
        token = secrets.token_urlsafe(32)
        session['csrf_token'] = token
    return token


def csrf_token():
    return _ensure_csrf_token()


def _validate_csrf():
    expected = session.get('csrf_token')
    supplied = (
        request.headers.get('X-CSRFToken') or
        request.headers.get('X-CSRF-Token') or
        request.form.get('csrf_token')
    )
    return bool(expected and supplied and secrets.compare_digest(expected, supplied))


def _login_user(user):
    session.clear()
    session.permanent = True
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role
    _ensure_csrf_token()
    user.last_login_at = datetime.utcnow()


def _logout_user():
    session.clear()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not getattr(g, 'current_user', None):
            if _wants_json():
                return _json_error('Login diperlukan.', 401)
            return redirect(url_for('login', next=request.full_path if request.query_string else request.path))
        return view(*args, **kwargs)
    return wrapped


def role_required(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = getattr(g, 'current_user', None)
            if not user:
                if _wants_json():
                    return _json_error('Login diperlukan.', 401)
                return redirect(url_for('login', next=request.path))
            if user.role not in roles:
                if _wants_json():
                    return _json_error('Akses ditolak untuk role ini.', 403)
                abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorator


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


def _clear_rate_events(bucket, key):
    bucket.pop(key, None)


def _is_login_locked(key):
    until = LOGIN_LOCKOUTS.get(key)
    if not until:
        return False
    if until <= datetime.utcnow():
        LOGIN_LOCKOUTS.pop(key, None)
        return False
    return True


def _lock_login(key):
    LOGIN_LOCKOUTS[key] = datetime.utcnow() + timedelta(minutes=app.config.get('LOGIN_LOCKOUT_MINUTES', 15))


def _login_rate_key(username):
    return f'{_client_ip()}:{(username or "").lower()}'


def _upload_rate_key():
    user = getattr(g, 'current_user', None)
    return f'{user.id if user else "anon"}:{_client_ip()}'


def _validate_password_policy(password):
    min_len = app.config.get('PASSWORD_MIN_LENGTH', 10)
    if len(password or '') < min_len:
        return f'Password minimal {min_len} karakter.'
    checks = [
        any(ch.islower() for ch in password),
        any(ch.isupper() for ch in password),
        any(ch.isdigit() for ch in password),
        any(not ch.isalnum() for ch in password),
    ]
    if sum(checks) < 3:
        return 'Password harus memakai minimal 3 jenis karakter: huruf kecil, huruf besar, angka, atau simbol.'
    return None


def _request_payload():
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def _bool_value(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on', 'aktif'}


def _check_upload_rate():
    key = _upload_rate_key()
    if _rate_limited(
        UPLOAD_EVENTS,
        key,
        app.config.get('UPLOAD_RATE_LIMIT', 10),
        app.config.get('UPLOAD_RATE_WINDOW_MINUTES', 10),
    ):
        raise ValueError('Terlalu banyak upload dalam waktu singkat. Coba lagi beberapa menit lagi.')
    _record_rate_event(UPLOAD_EVENTS, key, app.config.get('UPLOAD_RATE_WINDOW_MINUTES', 10))


def _audit(action, entity_type=None, entity_id=None, detail=None, status='SUCCESS', username=None):
    user = getattr(g, 'current_user', None)
    record = AuditLog(
        user_id=user.id if user else None,
        username=username or (user.username if user else None),
        role=user.role if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        status=status,
        ip_address=_client_ip(),
        user_agent=(request.headers.get('User-Agent') or '')[:255],
        detail_json=json.dumps(detail or {}, ensure_ascii=False),
    )
    db.session.add(record)


def _safe_commit_audit(action, detail=None, status='SUCCESS', username=None):
    try:
        _audit(action, detail=detail, status=status, username=username)
        db.session.commit()
    except Exception:
        db.session.rollback()


def _extension(filename):
    return secure_filename(filename or '').rsplit('.', 1)[-1].lower() if '.' in (filename or '') else ''


def _validate_upload_file(file, allowed_extensions):
    filename = secure_filename(file.filename or '')
    ext = _extension(filename)
    if not filename:
        raise ValueError('Nama file kosong.')
    if ext not in allowed_extensions:
        allowed = ', '.join(sorted(allowed_extensions))
        raise ValueError(f'Format file tidak diizinkan. Gunakan: {allowed}.')
    if request.content_length and request.content_length > app.config['MAX_CONTENT_LENGTH']:
        max_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
        raise ValueError(f'Ukuran file melebihi batas {max_mb} MB.')

    pos = file.stream.tell()
    head = file.stream.read(8)
    file.stream.seek(pos)
    if ext in {'xlsx', 'xlsm'} and not head.startswith(b'PK'):
        raise ValueError('File Excel tidak valid atau rusak.')
    if ext == 'xls' and head != XLS_SIGNATURE:
        raise ValueError('File XLS tidak valid atau rusak.')
    return filename, ext


@app.context_processor
def inject_security_context():
    return {
        'csrf_token': csrf_token,
        'current_user': lambda: getattr(g, 'current_user', None),
    }


@app.before_request
def apply_security_gate():
    g.current_user = _current_user()
    if g.current_user and not g.current_user.aktif:
        _logout_user()
        g.current_user = None

    if request.endpoint in PUBLIC_ENDPOINTS:
        return None

    if request.method not in SAFE_METHODS and not _validate_csrf():
        if _wants_json():
            return _json_error('CSRF token tidak valid.', 403)
        abort(403)

    if app.config.get('SECURITY_REQUIRE_LOGIN', True) and not g.current_user:
        if _wants_json():
            return _json_error('Login diperlukan.', 401)
        return redirect(url_for('login', next=request.full_path if request.query_string else request.path))
    return None


@app.after_request
def add_security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    response.headers.setdefault('Referrer-Policy', 'same-origin')
    response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    response.headers.setdefault(
        'Content-Security-Policy',
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'self';"
    )
    return response


@app.cli.command('create-admin')
@click.option('--username', prompt=True)
@click.option('--password', prompt=True, hide_input=True, confirmation_prompt=True)
@click.option('--name', default='Administrator')
def create_admin_command(username, password, name):
    password_error = _validate_password_policy(password)
    if password_error:
        raise click.ClickException(password_error)
    existing = User.query.filter_by(username=username.strip()).first()
    if existing:
        existing.role = 'admin'
        existing.aktif = True
        existing.nama_lengkap = name or existing.nama_lengkap
        existing.set_password(password)
        action = 'diperbarui'
    else:
        user = User(username=username.strip(), nama_lengkap=name, role='admin', aktif=True)
        user.set_password(password)
        db.session.add(user)
        action = 'dibuat'
    db.session.commit()
    click.echo(f'Admin {username} berhasil {action}.')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        if not _validate_csrf():
            abort(403)
        username = (request.form.get('username') or '').strip()
        password = request.form.get('password') or ''
        rate_key = _login_rate_key(username)
        if _is_login_locked(rate_key):
            _safe_commit_audit('LOGIN_RATE_LIMITED', detail={'username': username}, status='FAILED', username=username)
            return render_template('login.html',
                                   error='Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.',
                                   next_url=request.form.get('next', '')), 429
        if _rate_limited(
            LOGIN_FAILURES,
            rate_key,
            app.config.get('LOGIN_RATE_LIMIT', 5),
            app.config.get('LOGIN_RATE_WINDOW_MINUTES', 15),
        ):
            _safe_commit_audit('LOGIN_RATE_LIMITED', detail={'username': username}, status='FAILED', username=username)
            return render_template('login.html',
                                   error='Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.',
                                   next_url=request.form.get('next', '')), 429
        user = User.query.filter_by(username=username).first()
        if user and user.aktif and user.check_password(password):
            _login_user(user)
            g.current_user = user
            _clear_rate_events(LOGIN_FAILURES, rate_key)
            _audit('LOGIN', entity_type='user', entity_id=user.id, detail={'username': user.username})
            db.session.commit()
            next_url = request.form.get('next') or url_for('dashboard')
            if not next_url.startswith('/'):
                next_url = url_for('dashboard')
            return redirect(next_url)

        _record_rate_event(LOGIN_FAILURES, rate_key, app.config.get('LOGIN_RATE_WINDOW_MINUTES', 15))
        if _rate_limited(
            LOGIN_FAILURES,
            rate_key,
            app.config.get('LOGIN_RATE_LIMIT', 5),
            app.config.get('LOGIN_RATE_WINDOW_MINUTES', 15),
        ):
            _lock_login(rate_key)
        _safe_commit_audit('LOGIN_FAILED', detail={'username': username}, status='FAILED', username=username)
        return render_template('login.html', error='Username atau password tidak sesuai.', next_url=request.form.get('next', ''))

    if getattr(g, 'current_user', None):
        return redirect(url_for('dashboard'))
    return render_template('login.html', next_url=request.args.get('next', ''))


@app.route('/logout', methods=['POST'])
def logout():
    if not _validate_csrf():
        abort(403)
    username = session.get('username')
    _safe_commit_audit('LOGOUT', detail={'username': username}, username=username)
    _logout_user()
    return redirect(url_for('login'))


@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/penyulang')
def halaman_penyulang():
    return render_template('penyulang.html',
        eyebrow='Gardu Induk', judul='kWh Penyulang',
        icon='plug', desc='Data pembacaan meter per penyulang.')


def _render_meter_page(mode='utama'):
    is_pembanding = mode == 'pembanding'
    return render_template('meter_gi.html',
        eyebrow='Gardu Induk',
        judul='kWh Pembanding' if is_pembanding else 'kWh Utama',
        icon='gauge' if is_pembanding else 'bolt',
        desc='Data kWh meter pembanding per trafo gardu induk.' if is_pembanding else 'Data kWh meter utama per trafo gardu induk.',
        meter_mode='pembanding' if is_pembanding else 'utama',
        primary_total_label='Total MP Tahun' if is_pembanding else 'Total MU Tahun',
        secondary_total_label='Total MU Tahun' if is_pembanding else 'Total MP Tahun',
        primary_meta='meter pembanding' if is_pembanding else 'meter utama',
        secondary_meta='meter utama' if is_pembanding else 'meter pembanding',
        primary_icon='gauge' if is_pembanding else 'bolt',
        secondary_icon='bolt' if is_pembanding else 'gauge',
        primary_name='Meter Pembanding' if is_pembanding else 'Meter Utama',
        secondary_name='Meter Utama' if is_pembanding else 'Meter Pembanding',
        primary_short='MP' if is_pembanding else 'MU',
        secondary_short='MU' if is_pembanding else 'MP',
        chart_title='Tren MP vs MU' if is_pembanding else 'Tren MU vs MP',
        focus_chart_title='Pemakaian MP per Trafo' if is_pembanding else 'Pemakaian MU per Trafo',
        table_title='Rekap kWh Pembanding per Trafo' if is_pembanding else 'Rekap kWh Utama per Trafo',
        export_name='kwh_pembanding' if is_pembanding else 'kwh_utama')


@app.route('/kwh-utama')
def halaman_kwh_utama():
    return _render_meter_page('utama')


@app.route('/kwh-pembanding')
def halaman_kwh_pembanding():
    return _render_meter_page('pembanding')


@app.route('/meter-gi')
def halaman_meter_gi():
    return _render_meter_page('utama')


@app.route('/psgi')
def halaman_psgi():
    return render_template('rekap.html',
        eyebrow='Gardu Induk', judul='PSGI',
        icon='building-factory-2',
        desc='Pemakaian sendiri gardu induk per periode dan relasinya terhadap perhitungan susut.')

@app.route('/deviasi')
def halaman_deviasi():
    return render_template('deviasi.html',
        eyebrow='Gardu Induk', judul='Deviasi',
        icon='chart-bar', desc='Perbandingan MU vs MP vs total penyulang.')

@app.route('/proporsional')
def halaman_proporsional():
    return render_template('proporsional.html',
        eyebrow='UID', judul='Proporsional',
        icon='percentage', desc='Alokasi energi proporsional per penyulang.')

@app.route('/transfer-antar-uid')
def halaman_transfer_antar_uid():
    return render_template('transfer_uid.html',
        eyebrow='UID', judul='Transfer Antar UID',
        icon='arrows-transfer-up', desc='Rekap ekspor dan impor energi antar UID.')

@app.route('/transfer')
def halaman_transfer():
    return render_template('transfer.html',
        eyebrow='UID', judul='Transfer EXIM',
        icon='arrows-exchange', desc='Monitoring ekspor dan impor energi antar unit.')

@app.route('/rekap')
def halaman_rekap():
    return render_template('rekap.html',
        eyebrow='Rekap kWh', judul='Rekap kWh',
        icon='report', desc='Rekap kWh dan susut per GI per bulan.')


@app.route('/profile')
def halaman_profile():
    return render_template('profile.html',
        eyebrow='Akun', judul='Profile',
        icon='user-circle', desc='Informasi akun dan preferensi akses aplikasi.')

@app.route('/upload')
@role_required('admin', 'operator')
def halaman_upload():
    return render_template('upload.html',
        eyebrow='Laporan', judul='Upload NKWh',
        icon='upload', desc='Upload file NKWh Excel/CSV untuk import data penyulang.')


@app.route('/security')
@role_required('admin')
def halaman_security():
    return render_template('security.html',
        eyebrow='Admin', judul='Security',
        icon='shield-lock', desc='Manajemen user dan audit log aplikasi.')


# ════════════════════════════════════════════════
# API — SIDEBAR STATS (diload di base.html)
# ════════════════════════════════════════════════

@app.route('/api/sidebar-stats')
def api_sidebar_stats():
    """
    Data mini stats sidebar: jumlah GI aktif dan jumlah alert.
    Ringan — tidak join banyak tabel.
    """
    try:
        gi_aktif = GarduInduk.query.filter_by(aktif=True).count()

        # Alert = FeederReading dengan flag_alert=True bulan ini
        from datetime import date
        bulan_ini = date.today().replace(day=1)
        alert_count = FeederReading.query.filter_by(
            flag_alert=True,
            periode_bulan=bulan_ini
        ).count()

        return jsonify({
            'gi_aktif':    gi_aktif,
            'alert_count': alert_count
        })
    except Exception as e:
        return jsonify({'gi_aktif': 0, 'alert_count': 0, 'error': str(e)})


# ════════════════════════════════════════════════
# API — MASTER DATA
# ════════════════════════════════════════════════

@app.route('/api/gardu-induk')
def api_gardu_induk():
    try:
        gis = GarduInduk.query.filter_by(aktif=True).order_by(GarduInduk.nama_gi).all()
        return jsonify([g.to_dict() for g in gis])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/trafo')
def api_trafo():
    try:
        gi_id = request.args.get('gi_id', type=int)
        q = Trafo.query.filter_by(aktif=True)
        if gi_id:
            q = q.filter_by(gi_id=gi_id)
        return jsonify([t.to_dict() for t in q.order_by(Trafo.kode_trafo).all()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/penyulang')
def api_penyulang_list():
    try:
        trafo_id = request.args.get('trafo_id', type=int)
        gi_id    = request.args.get('gi_id',    type=int)
        area_up3 = request.args.get('area_up3', '').strip()
        status   = request.args.get('status', '').strip()
        q = Penyulang.query
        if not status:
            q = q.filter_by(aktif=True)
        if trafo_id:
            q = q.filter_by(trafo_id=trafo_id)
        if gi_id:
            q = q.filter_by(gi_id=gi_id)
        if area_up3:
            q = q.filter(Penyulang.area_up3 == area_up3)
        if status:
            q = q.filter(Penyulang.status == status)
        return jsonify([p.to_dict() for p in q.order_by(Penyulang.kode_penyulang).all()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/penyulang-area')
def api_penyulang_area():
    try:
        rows = db.session.query(Penyulang.area_up3)\
            .filter(Penyulang.aktif.is_(True))\
            .filter(Penyulang.area_up3.isnot(None))\
            .filter(Penyulang.area_up3 != '')\
            .distinct()\
            .order_by(Penyulang.area_up3)\
            .all()
        return jsonify([r[0] for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — DASHBOARD
# ════════════════════════════════════════════════

@app.route('/api/dashboard-data')
def get_dashboard_data():
    try:
        tahun = request.args.get('tahun', type=int)

        sub_mu = db.session.query(
            MeterReading.periode_bulan,
            func.sum(
                func.coalesce(MeterReading.mu_kwh_wbp,   0) +
                func.coalesce(MeterReading.mu_kwh_lwbp1, 0) +
                func.coalesce(MeterReading.mu_kwh_lwbp2, 0)
            ).label('total_mu')
        ).group_by(MeterReading.periode_bulan)

        sub_py = db.session.query(
            FeederReading.periode_bulan,
            func.sum(
                func.coalesce(FeederReading.kwh_wbp,   0) +
                func.coalesce(FeederReading.kwh_lwbp1, 0) +
                func.coalesce(FeederReading.kwh_lwbp2, 0)
            ).label('total_penyulang')
        ).group_by(FeederReading.periode_bulan)

        if tahun:
            sub_mu = sub_mu.filter(func.extract('year', MeterReading.periode_bulan) == tahun)
            sub_py = sub_py.filter(func.extract('year', FeederReading.periode_bulan) == tahun)

        sub_mu = sub_mu.subquery()
        sub_py = sub_py.subquery()

        rows = db.session.query(
            sub_mu.c.periode_bulan,
            sub_mu.c.total_mu,
            func.coalesce(sub_py.c.total_penyulang, 0).label('total_penyulang')
        ).outerjoin(
            sub_py, sub_mu.c.periode_bulan == sub_py.c.periode_bulan
        ).order_by(sub_mu.c.periode_bulan).all()

        data = []
        t_mu = t_py = 0
        for r in rows:
            mu  = float(r.total_mu)
            py  = float(r.total_penyulang)
            sk  = mu - py
            pct = round(sk / mu * 100, 2) if mu > 0 else 0
            t_mu += mu; t_py += py
            data.append({
                'tanggal':          r.periode_bulan.strftime('%Y-%m-%d'),
                'meter_utama':      mu,
                'total_penyulang':  py,
                'susut_kwh':        round(sk, 2),
                'persentase_susut': pct,
            })

        t_sk  = t_mu - t_py
        t_pct = round(t_sk / t_mu * 100, 2) if t_mu > 0 else 0
        return jsonify({
            'data_bulanan': data,
            'total': {
                'meter_utama':      t_mu,
                'total_penyulang':  t_py,
                'total_susut':      round(t_sk, 2),
                'persentase_total': t_pct,
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — FEEDER, METER, TRANSFER, REKAP
# ════════════════════════════════════════════════

@app.route('/api/feeder-data')
def api_feeder_data():
    try:
        gi_id    = request.args.get('gi_id',    type=int)
        trafo_id = request.args.get('trafo_id', type=int)
        bulan    = request.args.get('bulan', '').strip()
        
        q = db.session.query(FeederReading, Penyulang)\
              .join(Penyulang, FeederReading.penyulang_id == Penyulang.id)
        if gi_id:    q = q.filter(FeederReading.gi_id    == gi_id)
        if trafo_id: q = q.filter(FeederReading.trafo_id == trafo_id)
        if bulan:
            try:
                thn, bln = bulan.split('-')
                thn, bln = int(thn), int(bln)
                if not (1 <= bln <= 12) or thn < 2000 or thn > 2100:
                    return jsonify({'error': 'Invalid date format'}), 400
                q = q.filter(
                    func.extract('year',  FeederReading.periode_bulan) == thn,
                    func.extract('month', FeederReading.periode_bulan) == bln
                )
            except (ValueError, AttributeError):
                return jsonify({'error': 'Format bulan harus YYYY-MM'}), 400
        
        result = []
        for fr, py in q.order_by(Penyulang.kode_penyulang).all():
            d = fr.to_dict()
            d['kode_penyulang'] = py.kode_penyulang
            d['nama_penyulang'] = py.nama_penyulang
            d['jenis'] = py.jenis
            d['area_up3'] = py.area_up3
            d['ex_cabang'] = py.ex_cabang
            d['status'] = py.status or ('AKTIF' if py.aktif else 'NONAKTIF')
            result.append(d)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/meter-data')
def api_meter_data():
    try:
        gi_id    = request.args.get('gi_id',    type=int)
        trafo_id = request.args.get('trafo_id', type=int)
        bulan    = request.args.get('bulan')

        q = db.session.query(MeterReading, Trafo, GarduInduk)\
              .join(Trafo,      MeterReading.trafo_id == Trafo.id)\
              .join(GarduInduk, MeterReading.gi_id    == GarduInduk.id)
        if gi_id:    q = q.filter(MeterReading.gi_id    == gi_id)
        if trafo_id: q = q.filter(MeterReading.trafo_id == trafo_id)
        if bulan:
            thn, bln = bulan.split('-')
            q = q.filter(
                func.extract('year',  MeterReading.periode_bulan) == int(thn),
                func.extract('month', MeterReading.periode_bulan) == int(bln)
            )

        result = []
        for mr, tr, gi in q.order_by(MeterReading.periode_bulan).all():
            d = mr.to_dict()
            d['kode_trafo'] = tr.kode_trafo
            d['nama_trafo'] = tr.nama_trafo
            d['nama_gi']    = gi.nama_gi
            result.append(d)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/transfer-data')
def api_transfer_data():
    try:
        bulan = request.args.get('bulan')
        tahun = request.args.get('tahun', type=int)
        q = TransferAntarUnit.query
        if bulan:
            thn, bln = bulan.split('-')
            q = q.filter(
                func.extract('year',  TransferAntarUnit.periode_bulan) == int(thn),
                func.extract('month', TransferAntarUnit.periode_bulan) == int(bln)
            )
        elif tahun:
            q = q.filter(func.extract('year', TransferAntarUnit.periode_bulan) == tahun)
        return jsonify([r.to_dict() for r in q.order_by(TransferAntarUnit.periode_bulan).all()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rekap')
def api_rekap():
    try:
        tahun = request.args.get('tahun', type=int)
        gi_id = request.args.get('gi_id', type=int)
        q = db.session.query(RekapBulanan, GarduInduk)\
              .join(GarduInduk, RekapBulanan.gi_id == GarduInduk.id)\
              .filter(RekapBulanan.trafo_id.is_(None))
        if tahun: q = q.filter(func.extract('year', RekapBulanan.periode_bulan) == tahun)
        if gi_id: q = q.filter(RekapBulanan.gi_id == gi_id)
        result = []
        for rb, gi in q.order_by(RekapBulanan.periode_bulan).all():
            d = rb.to_dict()
            d['nama_gi'] = gi.nama_gi
            d['kode_gi'] = gi.kode_gi
            result.append(d)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — UPLOAD (placeholder, lengkap di Sesi 2)
# ════════════════════════════════════════════════

@app.route('/api/audit-log')
@role_required('admin')
def api_audit_log():
    try:
        limit = request.args.get('limit', default=100, type=int)
        limit = min(max(limit, 1), 500)
        rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
        return jsonify([row.to_dict() for row in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/security-summary')
@role_required('admin')
def api_security_summary():
    try:
        users_total = User.query.count()
        active_users = User.query.filter_by(aktif=True).count()
        failed_logins = AuditLog.query.filter_by(action='LOGIN_FAILED').count()
        imports = AuditLog.query.filter(
            AuditLog.action.in_(['IMPORT_NKWH', 'IMPORT_PENYULANG'])
        ).count()
        return jsonify({
            'users_total': users_total,
            'active_users': active_users,
            'failed_logins': failed_logins,
            'imports': imports,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users')
@role_required('admin')
def api_users_list():
    try:
        rows = User.query.order_by(User.username).all()
        return jsonify([row.to_dict() for row in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users', methods=['POST'])
@role_required('admin')
def api_users_create():
    payload = _request_payload()
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''
    role = (payload.get('role') or 'viewer').strip().lower()
    if not username:
        return jsonify({'error': 'Username wajib diisi.'}), 400
    if role not in ROLES:
        return jsonify({'error': 'Role tidak valid.'}), 400
    password_error = _validate_password_policy(password)
    if password_error:
        return jsonify({'error': password_error}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username sudah digunakan.'}), 409

    user = User(
        username=username,
        nama_lengkap=(payload.get('nama_lengkap') or '').strip() or username,
        email=(payload.get('email') or '').strip() or None,
        role=role,
        aktif=_bool_value(payload.get('aktif', True)),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    _audit('CREATE_USER', entity_type='user', entity_id=user.id, detail=user.to_dict())
    db.session.commit()
    return jsonify(user.to_dict()), 201


@app.route('/api/users/<int:user_id>', methods=['PATCH', 'POST'])
@role_required('admin')
def api_users_update(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User tidak ditemukan.'}), 404
    payload = _request_payload()
    role = (payload.get('role') or user.role).strip().lower()
    if role not in ROLES:
        return jsonify({'error': 'Role tidak valid.'}), 400
    admin_count = User.query.filter_by(role='admin', aktif=True).count()
    new_active = _bool_value(payload.get('aktif', user.aktif))
    if user.role == 'admin' and (role != 'admin' or not new_active) and admin_count <= 1:
        return jsonify({'error': 'Minimal harus ada satu admin aktif.'}), 400

    before = user.to_dict()
    user.nama_lengkap = (payload.get('nama_lengkap') or user.nama_lengkap or user.username).strip()
    user.email = (payload.get('email') or '').strip() or None
    user.role = role
    user.aktif = new_active
    db.session.flush()
    _audit('UPDATE_USER', entity_type='user', entity_id=user.id, detail={
        'before': before,
        'after': user.to_dict(),
    })
    db.session.commit()
    return jsonify(user.to_dict())


@app.route('/api/users/<int:user_id>/password', methods=['POST'])
@role_required('admin')
def api_users_reset_password(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User tidak ditemukan.'}), 404
    payload = _request_payload()
    password = payload.get('password') or ''
    password_error = _validate_password_policy(password)
    if password_error:
        return jsonify({'error': password_error}), 400
    user.set_password(password)
    db.session.flush()
    _audit('RESET_USER_PASSWORD', entity_type='user', entity_id=user.id, detail={'username': user.username})
    db.session.commit()
    return jsonify({'message': 'Password berhasil direset.'})


@app.route('/api/me/password', methods=['POST'])
def api_change_own_password():
    user = getattr(g, 'current_user', None)
    if not user:
        return jsonify({'error': 'Login diperlukan.'}), 401
    payload = _request_payload()
    current_password = payload.get('current_password') or ''
    new_password = payload.get('new_password') or ''
    if not user.check_password(current_password):
        return jsonify({'error': 'Password lama tidak sesuai.'}), 400
    password_error = _validate_password_policy(new_password)
    if password_error:
        return jsonify({'error': password_error}), 400
    user.set_password(new_password)
    db.session.flush()
    _audit('CHANGE_OWN_PASSWORD', entity_type='user', entity_id=user.id, detail={'username': user.username})
    db.session.commit()
    return jsonify({'message': 'Password berhasil diganti.'})


@app.route('/api/upload', methods=['POST'])
@role_required('admin', 'operator')
def api_upload():
    """
    Upload file NKWh Excel/CSV.
    Implementasi lengkap ada di upload_engine.py.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang dikirim'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nama file kosong'}), 400
    try:
        _check_upload_rate()
        _validate_upload_file(file, ALLOWED_GENERIC_UPLOADS)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    # TODO: integrasikan dengan UploadEngine dari upload_engine.py
    # from upload_engine import UploadEngine
    # engine = UploadEngine()
    # result = engine.proses(tmp_path, gi_id, trafo_id, periode)
    return jsonify({'message': 'Upload endpoint aktif. Integrasi UploadEngine belum selesai.'}), 200


def _norm_col(value):
    return ''.join(ch for ch in str(value).strip().lower() if ch.isalnum())


def _pick(row, aliases, default=None):
    for alias in aliases:
        key = _norm_col(alias)
        if key in row and pd.notna(row[key]) and str(row[key]).strip() != '':
            return row[key]
    return default


def _num(value, default=0):
    if value is None or pd.isna(value) or str(value).strip() == '':
        return default
    text_value = str(value).replace('.', '').replace(',', '.') if isinstance(value, str) else value
    try:
        return float(text_value)
    except (TypeError, ValueError):
        return default


def _str_value(value, default=''):
    if value is None or pd.isna(value):
        return default
    return str(value).strip()


def _month_date(value, fallback=None):
    if value is None or pd.isna(value) or str(value).strip() == '':
        if fallback:
            year, month = fallback.split('-')[:2]
            return date(int(year), int(month), 1)
        raise ValueError('Kolom bulan/periode wajib diisi')
    if hasattr(value, 'year') and hasattr(value, 'month'):
        return date(int(value.year), int(value.month), 1)
    raw = str(value).strip()
    if len(raw) == 7 and raw[4] == '-':
        return date(int(raw[:4]), int(raw[5:7]), 1)
    parsed = pd.to_datetime(raw, errors='coerce', dayfirst=True)
    if pd.isna(parsed):
        raise ValueError(f'Format bulan tidak dikenali: {raw}')
    return date(int(parsed.year), int(parsed.month), 1)


def _previous_month(period):
    return date(period.year - 1, 12, 1) if period.month == 1 else date(period.year, period.month - 1, 1)


def _read_upload_table(file):
    _validate_upload_file(file, ALLOWED_GENERIC_UPLOADS)
    filename = file.filename.lower()
    if filename.endswith(('.xlsx', '.xlsm', '.xls')):
        frame = pd.read_excel(file)
    elif filename.endswith('.csv'):
        frame = pd.read_csv(file)
    else:
        raise ValueError('Format file harus CSV atau Excel (.xlsx/.xls)')
    frame = frame.dropna(how='all')
    if len(frame) > app.config['MAX_IMPORT_ROWS']:
        raise ValueError(f'Jumlah baris melebihi batas {app.config["MAX_IMPORT_ROWS"]}.')
    frame.columns = [_norm_col(col) for col in frame.columns]
    return frame


def _find_or_create_gi(row, default_gi_id):
    if default_gi_id:
        gi = GarduInduk.query.get(default_gi_id)
        if gi:
            return gi
    kode = _str_value(_pick(row, ['kode_gi', 'kode gardu induk', 'gi']), '')
    nama = _str_value(_pick(row, ['nama_gi', 'gardu_induk', 'gardu induk', 'nama gardu induk']), kode)
    if not kode and not nama:
        raise ValueError('GI tidak ditemukan. Isi kode_gi/nama_gi atau pilih default GI.')
    gi = GarduInduk.query.filter(
        (GarduInduk.kode_gi == kode) | (GarduInduk.nama_gi == nama)
    ).first()
    if gi:
        return gi
    gi = GarduInduk(kode_gi=kode or nama[:20].upper(), nama_gi=nama or kode, aktif=True)
    db.session.add(gi)
    db.session.flush()
    return gi


def _find_or_create_trafo(row, gi, default_trafo_id):
    if default_trafo_id:
        trafo = Trafo.query.get(default_trafo_id)
        if trafo:
            return trafo
    kode = _str_value(_pick(row, ['kode_trafo', 'trafo', 'kode trafo']), '')
    nama = _str_value(_pick(row, ['nama_trafo', 'nama trafo']), kode or 'Trafo 1')
    if not kode:
        kode = 'TRF-1'
    trafo = Trafo.query.filter_by(gi_id=gi.id, kode_trafo=kode).first()
    if trafo:
        return trafo
    trafo = Trafo(
        gi_id=gi.id,
        kode_trafo=kode,
        nama_trafo=nama or kode,
        kapasitas_mva=Decimal('0'),
        tegangan_kv=Decimal('20'),
        aktif=True,
    )
    db.session.add(trafo)
    db.session.flush()
    return trafo


def _find_or_create_penyulang(row, gi, trafo):
    kode = _str_value(_pick(row, ['kode_penyulang', 'kode penyulang', 'kode', 'penyulang']), '')
    nama = _str_value(_pick(row, ['nama_penyulang', 'nama penyulang', 'nama', 'feeder']), kode)
    if not kode:
        raise ValueError('kode_penyulang wajib diisi')
    penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, kode_penyulang=kode).first()
    if not penyulang:
        penyulang = Penyulang(
            trafo_id=trafo.id,
            gi_id=gi.id,
            kode_penyulang=kode,
            nama_penyulang=nama or kode,
            aktif=True,
        )
        db.session.add(penyulang)
    penyulang.nama_penyulang = nama or penyulang.nama_penyulang
    penyulang.jenis = _str_value(_pick(row, ['jenis', 'jenis_penyulang'], penyulang.jenis or 'REGULAR'), 'REGULAR').upper()
    penyulang.area_up3 = _str_value(_pick(row, ['area_up3', 'area', 'up3', 'area up3'], penyulang.area_up3), penyulang.area_up3)
    penyulang.ex_cabang = _str_value(_pick(row, ['ex_cabang', 'ex cabang', 'cabang'], penyulang.ex_cabang), penyulang.ex_cabang)
    penyulang.status = _str_value(_pick(row, ['status', 'status_penyulang', 'status penyulang'], penyulang.status or 'AKTIF'), 'AKTIF').upper()
    penyulang.aktif = penyulang.status not in {'NONAKTIF', 'OFF', 'PADAM PERMANEN'}
    db.session.flush()
    return penyulang


def _reading_values(row):
    faktor = _num(_pick(row, ['faktor_kali', 'faktor', 'fk']), 1) or 1
    stand_awal = _num(_pick(row, ['stand_awal', 'stand awal', 'awal']), 0)
    stand_akhir = _num(_pick(row, ['stand_akhir', 'stand akhir', 'akhir']), 0)
    wbp = _num(_pick(row, ['kwh_wbp', 'wbp']), 0)
    lwbp1 = _num(_pick(row, ['kwh_lwbp1', 'lwbp1', 'lwbp', 'lwbp_1']), 0)
    lwbp2 = _num(_pick(row, ['kwh_lwbp2', 'lwbp2', 'lwbp_2']), 0)
    total = _num(_pick(row, ['kwh_total', 'total_kwh', 'total kwh', 'total']), 0)

    if stand_akhir and faktor and not any([wbp, lwbp1, lwbp2, total]):
        total = max(0, (stand_akhir - stand_awal) * faktor)
        wbp, lwbp1, lwbp2 = total, 0, 0
    elif total and not any([wbp, lwbp1, lwbp2]):
        wbp, lwbp1, lwbp2 = total, 0, 0
    else:
        total = wbp + lwbp1 + lwbp2

    return stand_awal, stand_akhir, faktor, wbp, lwbp1, lwbp2, total


def _set_anomaly(reading, threshold_pct, min_delta):
    previous = FeederReading.query.filter_by(
        penyulang_id=reading.penyulang_id,
        periode_bulan=_previous_month(reading.periode_bulan)
    ).first()
    reading.flag_alert = False
    reading.deviasi_persen = Decimal('0')
    reading.anomaly_type = None
    reading.catatan = None
    if not previous or previous.kwh_total <= 0:
        return
    delta = reading.kwh_total - previous.kwh_total
    pct = (delta / previous.kwh_total) * 100
    if abs(delta) >= min_delta and abs(pct) >= threshold_pct:
        reading.flag_alert = True
        reading.deviasi_persen = Decimal(str(round(pct, 2)))
        reading.anomaly_type = 'NAIK' if delta > 0 else 'TURUN'
        reading.catatan = (
            f'Anomali {reading.anomaly_type.lower()} {round(pct, 2)}% '
            f'dari bulan sebelumnya ({round(previous.kwh_total)} ke {round(reading.kwh_total)} kWh).'
        )


def _slug_code(value, fallback='DATA', max_len=30):
    raw = _str_value(value, fallback).upper()
    code = ''.join(ch if ch.isalnum() else '-' for ch in raw)
    code = '-'.join(part for part in code.split('-') if part)
    return (code or fallback)[:max_len]


def _decimal_or_none(value):
    if value is None:
        return None
    return Decimal(str(value))


def _decimal_or_zero(value):
    return Decimal(str(value or 0))


def _nkwh_period(value, fallback=None):
    if value:
        return date.fromisoformat(value)
    if fallback:
        return _month_date(fallback)
    raise ValueError('Periode bulan tidak ditemukan dari workbook. Isi default bulan saat import.')


def _find_or_create_gi_from_name(name):
    nama = _str_value(name, 'Belum Dipetakan')
    kode = _slug_code(nama, 'GI', 20)
    gi = GarduInduk.query.filter(
        (GarduInduk.kode_gi == kode) | (GarduInduk.nama_gi == nama)
    ).first()
    if gi:
        return gi
    gi = GarduInduk(kode_gi=kode, nama_gi=nama, aktif=True)
    db.session.add(gi)
    db.session.flush()
    return gi


def _find_or_create_trafo_from_nkwh(gi, kode_trafo, nama_trafo):
    raw = _str_value(kode_trafo, 'TRF-1')
    raw_upper = raw.upper()
    kode = raw_upper if raw_upper.startswith('TRF') else f'TRF-{raw_upper}'
    candidates = {raw_upper, kode, f'{gi.kode_gi}-T{raw_upper}', f'{gi.kode_gi}-{kode}'}
    trafo = Trafo.query.filter(Trafo.gi_id == gi.id, Trafo.kode_trafo.in_(candidates)).first()
    if not trafo:
        trafo = Trafo.query.filter(
            Trafo.gi_id == gi.id,
            Trafo.nama_trafo.in_({_str_value(nama_trafo, kode), f'Trafo {raw}'})
        ).first()
    if trafo:
        return trafo
    trafo = Trafo(
        gi_id=gi.id,
        kode_trafo=kode,
        nama_trafo=_str_value(nama_trafo, kode),
        kapasitas_mva=Decimal('0'),
        tegangan_kv=Decimal('20'),
        aktif=True,
    )
    db.session.add(trafo)
    db.session.flush()
    return trafo


def _find_or_create_penyulang_from_nkwh(item, gi, trafo):
    kode = _slug_code(item.get('kode_penyulang') or item.get('nama_penyulang'), 'PENYULANG', 30)
    nama = _str_value(item.get('nama_penyulang'), kode)
    penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, kode_penyulang=kode).first()
    if not penyulang:
        penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, nama_penyulang=nama).first()
    if not penyulang:
        penyulang = Penyulang(
            trafo_id=trafo.id,
            gi_id=gi.id,
            kode_penyulang=kode,
            nama_penyulang=nama,
            jenis='REGULAR',
            status='AKTIF',
            aktif=True,
        )
        db.session.add(penyulang)
    penyulang.gi_id = gi.id
    penyulang.nama_penyulang = nama or penyulang.nama_penyulang
    penyulang.status = penyulang.status or 'AKTIF'
    penyulang.aktif = penyulang.status not in {'NONAKTIF', 'OFF', 'PADAM PERMANEN'}
    db.session.flush()
    return penyulang


def _apply_nkwh_registers(reading, item):
    registers = item.get('registers') or {}
    for prefix in ('wbp', 'lwbp1', 'lwbp2'):
        detail = registers.get(prefix, {})
        setattr(reading, f'{prefix}_stand_awal', _decimal_or_none(detail.get('stand_awal')))
        setattr(reading, f'{prefix}_stand_akhir', _decimal_or_none(detail.get('stand_akhir')))
        setattr(reading, f'{prefix}_faktor_kali', _decimal_or_none(detail.get('faktor_kali')))

    first_register = next((registers[key] for key in ('wbp', 'lwbp1', 'lwbp2') if key in registers), {})
    reading.stand_awal = _decimal_or_none(first_register.get('stand_awal'))
    reading.stand_akhir = _decimal_or_none(first_register.get('stand_akhir'))
    reading.faktor_kali = _decimal_or_none(first_register.get('faktor_kali')) or Decimal('1')

    reading.kwh_wbp = _decimal_or_zero(item.get('kwh_wbp'))
    reading.kwh_lwbp1 = _decimal_or_zero(item.get('kwh_lwbp1'))
    reading.kwh_lwbp2 = _decimal_or_zero(item.get('kwh_lwbp2'))
    reading.manual_kwh_wbp = _decimal_or_none(item.get('manual_kwh_wbp'))
    reading.manual_kwh_lwbp1 = _decimal_or_none(item.get('manual_kwh_lwbp1'))
    reading.manual_kwh_lwbp2 = _decimal_or_none(item.get('manual_kwh_lwbp2'))
    reading.source_format = 'NKWH_XLSX'
    reading.source_sheet = item.get('source_sheet')
    reading.source_row_start = item.get('source_row_start')
    reading.source_row_end = item.get('source_row_end')


def _import_nkwh_exim_rows(exim_rows, period):
    imported = updated = 0
    for row in exim_rows:
        kode_rule = _slug_code(
            f"{row.get('gardu_induk')}-{row.get('feeder')}-{row.get('row')}",
            'EXIM',
            60
        )
        rule = EximRule.query.filter_by(kode_rule=kode_rule).first()
        if rule:
            updated += 1
        else:
            imported += 1
            rule = EximRule(kode_rule=kode_rule)
            db.session.add(rule)

        rule.nama_rule = _str_value(row.get('feeder'), kode_rule)
        rule.metode = row.get('metode') or 'ADJUSTMENT'
        rule.up3_asal = row.get('area_asal') or None
        rule.up3_tujuan = row.get('area_tujuan') or None
        rule.fungsi = row.get('fungsi') or None
        rule.arah = row.get('arah') or None
        rule.periode_mulai = period
        rule.source_sheet = 'Exim'
        rule.source_row = row.get('row')
        rule.catatan = row.get('jenis') or row.get('lokasi')
        db.session.flush()

        result = EximMonthlyResult.query.filter_by(
            rule_id=rule.id,
            periode_bulan=period,
            up3_tujuan=rule.up3_tujuan,
        ).first()
        if not result:
            result = EximMonthlyResult(
                rule_id=rule.id,
                periode_bulan=period,
            )
            db.session.add(result)

        basis = row.get('kwh_penyulang_basis') or 0
        transfer = row.get('kwh_total') or sum([
            row.get('kwh_wbp') or 0,
            row.get('kwh_lwbp1') or 0,
            row.get('kwh_lwbp2') or 0,
        ])
        result.metode = rule.metode
        result.up3_asal = rule.up3_asal
        result.up3_tujuan = rule.up3_tujuan
        result.fungsi = rule.fungsi
        result.arah = rule.arah
        result.kwh_basis = _decimal_or_zero(basis)
        result.kwh_wbp = _decimal_or_zero(row.get('kwh_wbp'))
        result.kwh_lwbp1 = _decimal_or_zero(row.get('kwh_lwbp1'))
        result.kwh_lwbp2 = _decimal_or_zero(row.get('kwh_lwbp2'))
        result.kwh_transfer = _decimal_or_zero(transfer)
        result.porsi = _decimal_or_none(transfer / basis) if basis else None
        result.source_sheet = 'Exim'
        result.source_row = row.get('row')
        result.catatan = row.get('lokasi')
    return imported, updated


@app.route('/api/nkwh/analyze', methods=['POST'])
@role_required('admin', 'operator')
def api_nkwh_analyze():
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang dikirim'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Nama file kosong'}), 400

    try:
        _check_upload_rate()
        safe_filename, _ = _validate_upload_file(file, ALLOWED_NKWH_UPLOADS)
        result = analyze_workbook(file.stream)
        if result.get('kwh_penyulang', {}).get('feeder_count', 0) > app.config['MAX_IMPORT_ROWS']:
            return jsonify({'error': f'Jumlah data penyulang melebihi batas {app.config["MAX_IMPORT_ROWS"]}.'}), 400
        result['filename'] = safe_filename
        _audit('ANALYZE_NKWH', entity_type='upload', detail={
            'filename': safe_filename,
            'periode_bulan': result.get('periode_bulan'),
            'feeder_count': result.get('kwh_penyulang', {}).get('feeder_count'),
            'exim_rows': result.get('exim', {}).get('row_count'),
        })
        db.session.commit()
        return jsonify(result)
    except Exception as e:
        db.session.rollback()
        _safe_commit_audit('ANALYZE_NKWH', detail={'filename': file.filename, 'error': str(e)}, status='FAILED')
        return jsonify({'error': str(e)}), 500


@app.route('/api/nkwh/import', methods=['POST'])
@role_required('admin', 'operator')
def api_nkwh_import():
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang dikirim'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Nama file kosong'}), 400

    threshold_pct = request.form.get('threshold_pct', default=25, type=float)
    min_delta = request.form.get('min_delta', default=10000, type=float)
    default_bulan = request.form.get('bulan', '').strip()
    import_exim = request.form.get('import_exim', '1') == '1'

    try:
        _check_upload_rate()
        safe_filename, _ = _validate_upload_file(file, ALLOWED_NKWH_UPLOADS)
        parsed = parse_nkwh_feeders(file.stream)
        if parsed.get('feeder_count', 0) > app.config['MAX_IMPORT_ROWS']:
            return jsonify({'error': f'Jumlah data penyulang melebihi batas {app.config["MAX_IMPORT_ROWS"]}.'}), 400
        period = _nkwh_period(parsed.get('periode_bulan'), default_bulan or None)
        created = updated = alerts = 0

        for item in parsed.get('feeders', []):
            gi = _find_or_create_gi_from_name(item.get('gardu_induk'))
            trafo = _find_or_create_trafo_from_nkwh(gi, item.get('kode_trafo'), item.get('nama_trafo'))
            penyulang = _find_or_create_penyulang_from_nkwh(item, gi, trafo)

            reading = FeederReading.query.filter_by(
                penyulang_id=penyulang.id,
                periode_bulan=period,
            ).first()
            if reading:
                updated += 1
            else:
                created += 1
                reading = FeederReading(
                    penyulang_id=penyulang.id,
                    periode_bulan=period,
                )
                db.session.add(reading)

            reading.trafo_id = trafo.id
            reading.gi_id = gi.id
            _apply_nkwh_registers(reading, item)
            db.session.flush()
            _set_anomaly(reading, threshold_pct, min_delta)
            if reading.flag_alert:
                alerts += 1

        exim_created = exim_updated = 0
        if import_exim:
            file.stream.seek(0)
            exim = parse_exim_rows(file.stream)
            exim_created, exim_updated = _import_nkwh_exim_rows(exim.get('rows', []), period)

        _audit('IMPORT_NKWH', entity_type='upload', detail={
            'filename': safe_filename,
            'periode_bulan': period.strftime('%Y-%m-%d'),
            'created': created,
            'updated': updated,
            'alerts': alerts,
            'exim_created': exim_created,
            'exim_updated': exim_updated,
            'feeder_count': parsed.get('feeder_count', 0),
            'gi_count': parsed.get('gi_count', 0),
        })
        db.session.commit()
        return jsonify({
            'message': 'Import NKWh selesai',
            'periode_bulan': period.strftime('%Y-%m-%d'),
            'created': created,
            'updated': updated,
            'alerts': alerts,
            'exim_created': exim_created,
            'exim_updated': exim_updated,
            'feeder_count': parsed.get('feeder_count', 0),
            'gi_count': parsed.get('gi_count', 0),
            'total_kwh': parsed.get('total_kwh', 0),
        })
    except Exception as e:
        db.session.rollback()
        _safe_commit_audit('IMPORT_NKWH', detail={'filename': file.filename, 'error': str(e)}, status='FAILED')
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload-penyulang', methods=['POST'])
@role_required('admin', 'operator')
def api_upload_penyulang():
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang dikirim'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Nama file kosong'}), 400

    default_gi_id = request.form.get('gi_id', type=int)
    default_trafo_id = request.form.get('trafo_id', type=int)
    default_bulan = request.form.get('bulan', '').strip()
    threshold_pct = request.form.get('threshold_pct', default=25, type=float)
    min_delta = request.form.get('min_delta', default=10000, type=float)

    try:
        _check_upload_rate()
        safe_filename, _ = _validate_upload_file(file, ALLOWED_GENERIC_UPLOADS)
        frame = _read_upload_table(file)
        created = updated = alerts = 0
        errors = []

        for idx, raw in frame.iterrows():
            row = raw.to_dict()
            try:
                period = _month_date(_pick(row, ['bulan', 'periode', 'periode_bulan', 'month']), default_bulan or None)
                gi = _find_or_create_gi(row, default_gi_id)
                trafo = _find_or_create_trafo(row, gi, default_trafo_id)
                penyulang = _find_or_create_penyulang(row, gi, trafo)
                stand_awal, stand_akhir, faktor, wbp, lwbp1, lwbp2, total = _reading_values(row)

                reading = FeederReading.query.filter_by(
                    penyulang_id=penyulang.id,
                    periode_bulan=period
                ).first()
                if reading:
                    updated += 1
                else:
                    created += 1
                    reading = FeederReading(
                        penyulang_id=penyulang.id,
                        trafo_id=trafo.id,
                        gi_id=gi.id,
                        periode_bulan=period,
                    )
                    db.session.add(reading)

                reading.trafo_id = trafo.id
                reading.gi_id = gi.id
                reading.stand_awal = Decimal(str(stand_awal))
                reading.stand_akhir = Decimal(str(stand_akhir))
                reading.faktor_kali = Decimal(str(faktor))
                reading.kwh_wbp = Decimal(str(wbp))
                reading.kwh_lwbp1 = Decimal(str(lwbp1))
                reading.kwh_lwbp2 = Decimal(str(lwbp2))
                db.session.flush()
                _set_anomaly(reading, threshold_pct, min_delta)
                if reading.flag_alert:
                    alerts += 1
            except Exception as row_error:
                errors.append({'baris': int(idx) + 2, 'error': str(row_error)})

        if errors and not (created or updated):
            db.session.rollback()
            _safe_commit_audit('IMPORT_PENYULANG', detail={
                'filename': safe_filename,
                'errors': errors[:10],
            }, status='FAILED')
            return jsonify({'error': 'Upload gagal. Tidak ada baris valid.', 'errors': errors[:10]}), 400

        _audit('IMPORT_PENYULANG', entity_type='upload', detail={
            'filename': safe_filename,
            'created': created,
            'updated': updated,
            'alerts': alerts,
            'error_count': len(errors),
        })
        db.session.commit()
        return jsonify({
            'message': 'Upload penyulang selesai',
            'created': created,
            'updated': updated,
            'alerts': alerts,
            'errors': errors[:10],
            'error_count': len(errors),
        })
    except Exception as e:
        db.session.rollback()
        _safe_commit_audit('IMPORT_PENYULANG', detail={'filename': file.filename, 'error': str(e)}, status='FAILED')
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# ERROR HANDLERS
# ════════════════════════════════════════════════

@app.errorhandler(403)
def forbidden(e):
    if _wants_json():
        return jsonify({'error': 'Akses ditolak.'}), 403
    return render_template('error.html',
                           kode=403,
                           judul='Akses Ditolak',
                           pesan='Kamu tidak memiliki izin untuk membuka halaman ini.'), 403


@app.errorhandler(413)
def payload_too_large(e):
    max_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
    if _wants_json():
        return jsonify({'error': f'Ukuran file melebihi batas {max_mb} MB.'}), 413
    return render_template('error.html',
                           kode=413,
                           judul='File Terlalu Besar',
                           pesan=f'Ukuran file melebihi batas {max_mb} MB.'), 413


@app.errorhandler(404)
def not_found(e):
    return render_template('error.html',
                           kode=404,
                           judul='Halaman Tidak Ditemukan',
                           pesan='URL yang kamu akses tidak ada.'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('error.html',
                           kode=500,
                           judul='Server Error',
                           pesan='Terjadi kesalahan di server. Cek log untuk detail.'), 500


# ════════════════════════════════════════════════
# JALANKAN
# ════════════════════════════════════════════════

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
