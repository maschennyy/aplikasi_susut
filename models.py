"""
models.py — Database models aplikasi susut energi
Menggantikan models.py lama yang hanya punya 2 tabel sederhana.

Struktur relasi:
  GarduInduk (1) ──> (N) Trafo (1) ──> (N) Penyulang
  Trafo      (1) ──> (N) MeterReading   (per bulan)
  Penyulang  (1) ──> (N) FeederReading  (per bulan)
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'app_user'
    __table_args__ = (
        db.UniqueConstraint('username', name='uq_user_username'),
    )

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), nullable=False)
    nama_lengkap  = db.Column(db.String(120))
    email         = db.Column(db.String(120))
    role          = db.Column(db.String(30), default='viewer', nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    aktif         = db.Column(db.Boolean, default=True)
    last_login_at = db.Column(db.DateTime)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow,
                              onupdate=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def display_name(self):
        return self.nama_lengkap or self.username

    @property
    def initials(self):
        words = [word for word in self.display_name.split() if word]
        if not words:
            return 'US'
        if len(words) == 1:
            return words[0][:2].upper()
        return (words[0][0] + words[-1][0]).upper()

    def has_role(self, *roles):
        return self.role in roles

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'nama_lengkap': self.nama_lengkap,
            'email': self.email,
            'role': self.role,
            'aktif': self.aktif,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
        }

    def __repr__(self):
        return f'<User {self.username} - {self.role}>'


class AuditLog(db.Model):
    __tablename__ = 'audit_log'

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('app_user.id'), nullable=True)
    username    = db.Column(db.String(80))
    role        = db.Column(db.String(30))
    action      = db.Column(db.String(80), nullable=False)
    entity_type = db.Column(db.String(80))
    entity_id   = db.Column(db.String(80))
    status      = db.Column(db.String(20), default='SUCCESS')
    ip_address  = db.Column(db.String(64))
    user_agent  = db.Column(db.String(255))
    detail_json = db.Column(db.Text)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    user        = db.relationship('User', backref='audit_logs')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'role': self.role,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'status': self.status,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'detail_json': self.detail_json,
        }


# ─────────────────────────────────────────────────────
# 1. GARDU INDUK
# ─────────────────────────────────────────────────────
class GarduInduk(db.Model):
    __tablename__ = 'gardu_induk'

    id          = db.Column(db.Integer, primary_key=True)
    kode_gi     = db.Column(db.String(20),  nullable=False, unique=True)  # 'TNG', 'SRP'
    nama_gi     = db.Column(db.String(100), nullable=False)               # 'GI Tangerang'
    area        = db.Column(db.String(100))                               # 'UP3 Tangerang'
    unit        = db.Column(db.String(100))                               # 'UID Banten'
    alamat      = db.Column(db.Text)
    aktif       = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow,
                            onupdate=datetime.utcnow)

    # Relasi
    trafos      = db.relationship('Trafo', backref='gardu_induk',
                                  lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':       self.id,
            'kode_gi':  self.kode_gi,
            'nama_gi':  self.nama_gi,
            'area':     self.area,
            'unit':     self.unit,
            'aktif':    self.aktif,
        }

    def __repr__(self):
        return f'<GarduInduk {self.kode_gi} - {self.nama_gi}>'


# ─────────────────────────────────────────────────────
# 2. TRAFO
# ─────────────────────────────────────────────────────
class Trafo(db.Model):
    __tablename__ = 'trafo'
    __table_args__ = (
        db.UniqueConstraint('gi_id', 'kode_trafo', name='uq_trafo_gi_kode'),
    )

    id             = db.Column(db.Integer, primary_key=True)
    gi_id          = db.Column(db.Integer, db.ForeignKey('gardu_induk.id',
                               ondelete='CASCADE'), nullable=False)
    kode_trafo     = db.Column(db.String(20),  nullable=False)   # 'TNG-T1'
    nama_trafo     = db.Column(db.String(100), nullable=False)   # 'Trafo 1'
    kapasitas_mva  = db.Column(db.Numeric(8, 2), nullable=False) # 60.00
    tegangan_kv    = db.Column(db.Numeric(6, 2))                 # 150.00
    aktif          = db.Column(db.Boolean, default=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow,
                               onupdate=datetime.utcnow)

    # Relasi
    penyulangs     = db.relationship('Penyulang', backref='trafo',
                                     lazy=True, cascade='all, delete-orphan')
    meter_readings = db.relationship('MeterReading', backref='trafo',
                                     lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':            self.id,
            'gi_id':         self.gi_id,
            'kode_trafo':    self.kode_trafo,
            'nama_trafo':    self.nama_trafo,
            'kapasitas_mva': float(self.kapasitas_mva),
            'tegangan_kv':   float(self.tegangan_kv) if self.tegangan_kv else None,
        }

    def __repr__(self):
        return f'<Trafo {self.kode_trafo}>'


# ─────────────────────────────────────────────────────
# 3. PENYULANG (FEEDER)
# ─────────────────────────────────────────────────────
class Penyulang(db.Model):
    __tablename__ = 'penyulang'
    __table_args__ = (
        db.UniqueConstraint('trafo_id', 'kode_penyulang', name='uq_penyulang_trafo_kode'),
    )

    id              = db.Column(db.Integer, primary_key=True)
    trafo_id        = db.Column(db.Integer, db.ForeignKey('trafo.id',
                                ondelete='CASCADE'), nullable=False)
    gi_id           = db.Column(db.Integer, db.ForeignKey('gardu_induk.id'),
                                nullable=False)
    kode_penyulang  = db.Column(db.String(30),  nullable=False)  # 'TNG-01'
    nama_penyulang  = db.Column(db.String(100), nullable=False)  # 'Batuceper'
    jenis           = db.Column(db.String(20),  default='REGULAR')
                      # REGULAR | INTERKONEKSI
    area_up3        = db.Column(db.String(100))                 # Pemilik area / UP3
    ex_cabang       = db.Column(db.String(50))                  # Kode eks cabang / unit asal data
    status          = db.Column(db.String(30), default='AKTIF') # AKTIF | NONAKTIF | CADANGAN
    aktif           = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                onupdate=datetime.utcnow)

    # Relasi
    gardu_induk     = db.relationship('GarduInduk', backref='penyulangs')
    feeder_readings = db.relationship('FeederReading', backref='penyulang',
                                    lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':             self.id,
            'trafo_id':       self.trafo_id,
            'gi_id':          self.gi_id,
            'kode_penyulang': self.kode_penyulang,
            'nama_penyulang': self.nama_penyulang,
            'jenis':          self.jenis,
            'area_up3':       self.area_up3,
            'ex_cabang':      self.ex_cabang,
            'status':         self.status or ('AKTIF' if self.aktif else 'NONAKTIF'),
            'aktif':          self.aktif,
        }

    def __repr__(self):
        return f'<Penyulang {self.kode_penyulang} - {self.nama_penyulang}>'


# ─────────────────────────────────────────────────────
# 4. METER READING (Meter Utama + Meter Pembanding)
#    Satu baris per Trafo per Bulan
# ─────────────────────────────────────────────────────
class MeterReading(db.Model):
    __tablename__ = 'meter_reading'
    __table_args__ = (
        db.UniqueConstraint('trafo_id', 'periode_bulan', name='uq_meter_trafo_bulan'),
    )

    id              = db.Column(db.Integer, primary_key=True)
    trafo_id        = db.Column(db.Integer, db.ForeignKey('trafo.id',
                                ondelete='CASCADE'), nullable=False)
    gi_id           = db.Column(db.Integer, db.ForeignKey('gardu_induk.id'),
                                nullable=False)
    # Selalu tanggal 1, misal: date(2025, 5, 1) = Mei 2025
    periode_bulan   = db.Column(db.Date, nullable=False)

    # ── Meter Utama (MU) ──────────────────────────────
    mu_stand_awal   = db.Column(db.Numeric(15, 2))
    mu_stand_akhir  = db.Column(db.Numeric(15, 2))
    mu_faktor_kali  = db.Column(db.Numeric(10, 2), default=1)
    mu_kwh_wbp      = db.Column(db.Numeric(15, 2))  # Waktu Beban Puncak
    mu_kwh_lwbp1    = db.Column(db.Numeric(15, 2))  # Luar WBP 1
    mu_kwh_lwbp2    = db.Column(db.Numeric(15, 2))  # Luar WBP 2

    # ── Meter Pembanding (MP) ─────────────────────────
    mp_stand_awal   = db.Column(db.Numeric(15, 2))
    mp_stand_akhir  = db.Column(db.Numeric(15, 2))
    mp_faktor_kali  = db.Column(db.Numeric(10, 2), default=1)
    mp_kwh_wbp      = db.Column(db.Numeric(15, 2))
    mp_kwh_lwbp1    = db.Column(db.Numeric(15, 2))
    mp_kwh_lwbp2    = db.Column(db.Numeric(15, 2))

    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                onupdate=datetime.utcnow)

    # ── Properti kalkulasi (computed, tidak disimpan) ──
    @property
    def mu_kwh_total(self):
        """Total kWh MU = WBP + LWBP1 + LWBP2"""
        return float(
            (self.mu_kwh_wbp   or 0) +
            (self.mu_kwh_lwbp1 or 0) +
            (self.mu_kwh_lwbp2 or 0)
        )

    @property
    def mp_kwh_total(self):
        """Total kWh MP = WBP + LWBP1 + LWBP2"""
        return float(
            (self.mp_kwh_wbp   or 0) +
            (self.mp_kwh_lwbp1 or 0) +
            (self.mp_kwh_lwbp2 or 0)
        )

    @property
    def deviasi_mu_mp(self):
        """Deviasi MU vs MP dalam persen: ((MU - MP) / MU) * 100"""
        if self.mu_kwh_total > 0:
            return round((self.mu_kwh_total - self.mp_kwh_total)
                         / self.mu_kwh_total * 100, 4)
        return 0.0

    def to_dict(self):
        return {
            'id':             self.id,
            'trafo_id':       self.trafo_id,
            'gi_id':          self.gi_id,
            'periode_bulan':  self.periode_bulan.strftime('%Y-%m-%d'),
            'mu_kwh_wbp':     float(self.mu_kwh_wbp   or 0),
            'mu_kwh_lwbp1':   float(self.mu_kwh_lwbp1 or 0),
            'mu_kwh_lwbp2':   float(self.mu_kwh_lwbp2 or 0),
            'mu_kwh_total':   self.mu_kwh_total,
            'mp_kwh_wbp':     float(self.mp_kwh_wbp   or 0),
            'mp_kwh_lwbp1':   float(self.mp_kwh_lwbp1 or 0),
            'mp_kwh_lwbp2':   float(self.mp_kwh_lwbp2 or 0),
            'mp_kwh_total':   self.mp_kwh_total,
            'deviasi_mu_mp':  self.deviasi_mu_mp,
        }

    def __repr__(self):
        return (f'<MeterReading trafo={self.trafo_id} '
                f'bulan={self.periode_bulan}>')


# ─────────────────────────────────────────────────────
# 5. FEEDER READING (Pembacaan per Penyulang per Bulan)
# ─────────────────────────────────────────────────────
class FeederReading(db.Model):
    __tablename__ = 'feeder_reading'
    __table_args__ = (
        db.UniqueConstraint('penyulang_id', 'periode_bulan',
                            name='uq_feeder_penyulang_bulan'),
    )

    id              = db.Column(db.Integer, primary_key=True)
    penyulang_id    = db.Column(db.Integer, db.ForeignKey('penyulang.id',
                                ondelete='CASCADE'), nullable=False)
    trafo_id        = db.Column(db.Integer, db.ForeignKey('trafo.id'),
                                nullable=False)
    gi_id           = db.Column(db.Integer, db.ForeignKey('gardu_induk.id'),
                                nullable=False)
    periode_bulan   = db.Column(db.Date, nullable=False)

    stand_awal      = db.Column(db.Numeric(15, 2))
    stand_akhir     = db.Column(db.Numeric(15, 2))
    faktor_kali     = db.Column(db.Numeric(10, 2), default=1)

    kwh_wbp         = db.Column(db.Numeric(15, 2))
    kwh_lwbp1       = db.Column(db.Numeric(15, 2))
    kwh_lwbp2       = db.Column(db.Numeric(15, 2))

    # Detail NKWh: workbook memisahkan stand per register H/L1/L2.
    wbp_stand_awal    = db.Column(db.Numeric(15, 2))
    wbp_stand_akhir   = db.Column(db.Numeric(15, 2))
    wbp_faktor_kali   = db.Column(db.Numeric(10, 2))
    lwbp1_stand_awal  = db.Column(db.Numeric(15, 2))
    lwbp1_stand_akhir = db.Column(db.Numeric(15, 2))
    lwbp1_faktor_kali = db.Column(db.Numeric(10, 2))
    lwbp2_stand_awal  = db.Column(db.Numeric(15, 2))
    lwbp2_stand_akhir = db.Column(db.Numeric(15, 2))
    lwbp2_faktor_kali = db.Column(db.Numeric(10, 2))

    manual_kwh_wbp    = db.Column(db.Numeric(15, 2))
    manual_kwh_lwbp1  = db.Column(db.Numeric(15, 2))
    manual_kwh_lwbp2  = db.Column(db.Numeric(15, 2))

    source_format     = db.Column(db.String(30))
    source_sheet      = db.Column(db.String(80))
    source_row_start  = db.Column(db.Integer)
    source_row_end    = db.Column(db.Integer)

    # Flag otomatis jika deviasi melebihi threshold
    flag_alert      = db.Column(db.Boolean, default=False)
    deviasi_persen  = db.Column(db.Numeric(8, 2))
    anomaly_type    = db.Column(db.String(30))
    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                onupdate=datetime.utcnow)

    # ── Properti kalkulasi ─────────────────────────────
    @property
    def kwh_total(self):
        """kWh Total = WBP + LWBP1 + LWBP2"""
        return float(
            (self.kwh_wbp   or 0) +
            (self.kwh_lwbp1 or 0) +
            (self.kwh_lwbp2 or 0)
        )

    @property
    def kwh_hitung(self):
        """
        kWh dari stand meter: (Stand Akhir - Stand Awal) × Faktor Kali
        Digunakan sebagai cross-check terhadap kwh_total dari meter.
        """
        if self.stand_akhir and self.stand_awal and self.faktor_kali:
            return float(
                (self.stand_akhir - self.stand_awal) * self.faktor_kali
            )
        return None

    @property
    def manual_kwh_total(self):
        """Total kWh manual dari split NKWh jika tersedia."""
        total = (
            (self.manual_kwh_wbp   or 0) +
            (self.manual_kwh_lwbp1 or 0) +
            (self.manual_kwh_lwbp2 or 0)
        )
        return float(total) if total else 0.0

    @property
    def register_kwh_hitung(self):
        """Total hitung dari stand WBP, LWBP1, dan LWBP2."""
        total = 0
        has_value = False
        for prefix in ('wbp', 'lwbp1', 'lwbp2'):
            awal = getattr(self, f'{prefix}_stand_awal')
            akhir = getattr(self, f'{prefix}_stand_akhir')
            faktor = getattr(self, f'{prefix}_faktor_kali') or 1
            if awal is not None and akhir is not None:
                total += (akhir - awal) * faktor
                has_value = True
        return float(total) if has_value else None

    def to_dict(self):
        return {
            'id':             self.id,
            'penyulang_id':   self.penyulang_id,
            'trafo_id':       self.trafo_id,
            'gi_id':          self.gi_id,
            'periode_bulan':  self.periode_bulan.strftime('%Y-%m-%d'),
            'stand_awal':     float(self.stand_awal   or 0),
            'stand_akhir':    float(self.stand_akhir  or 0),
            'faktor_kali':    float(self.faktor_kali  or 1),
            'kwh_wbp':        float(self.kwh_wbp      or 0),
            'kwh_lwbp1':      float(self.kwh_lwbp1    or 0),
            'kwh_lwbp2':      float(self.kwh_lwbp2    or 0),
            'kwh_total':      self.kwh_total,
            'kwh_hitung':     self.kwh_hitung,
            'register_kwh_hitung': self.register_kwh_hitung,
            'manual_kwh_wbp':     float(self.manual_kwh_wbp   or 0),
            'manual_kwh_lwbp1':   float(self.manual_kwh_lwbp1 or 0),
            'manual_kwh_lwbp2':   float(self.manual_kwh_lwbp2 or 0),
            'manual_kwh_total':   self.manual_kwh_total,
            'source_format':      self.source_format,
            'source_sheet':       self.source_sheet,
            'source_row_start':   self.source_row_start,
            'source_row_end':     self.source_row_end,
            'flag_alert':     self.flag_alert,
            'deviasi_persen':  float(self.deviasi_persen or 0),
            'anomaly_type':    self.anomaly_type,
            'catatan':         self.catatan,
        }

    def __repr__(self):
        return (f'<FeederReading penyulang={self.penyulang_id} '
                f'bulan={self.periode_bulan}>')


# ─────────────────────────────────────────────────────
# 6. TRANSFER ANTAR UNIT (EXIM)
# ─────────────────────────────────────────────────────
class TransferAntarUnit(db.Model):
    __tablename__ = 'transfer_antar_unit'

    id               = db.Column(db.Integer, primary_key=True)
    periode_bulan    = db.Column(db.Date, nullable=False)
    unit_asal        = db.Column(db.String(100), nullable=False)  # 'UP3 Tangerang'
    unit_tujuan      = db.Column(db.String(100), nullable=False)  # 'UP3 Jakarta Barat'
    gi_interkoneksi  = db.Column(db.String(100))                  # 'GI Serpong'
    kode_interbus    = db.Column(db.String(50))                   # 'TNG-JKB-01'
    kwh_transfer     = db.Column(db.Numeric(15, 2), nullable=False)
    arah             = db.Column(db.String(10), nullable=False)   # 'EKSPOR' | 'IMPOR'
    catatan          = db.Column(db.Text)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':              self.id,
            'periode_bulan':   self.periode_bulan.strftime('%Y-%m-%d'),
            'unit_asal':       self.unit_asal,
            'unit_tujuan':     self.unit_tujuan,
            'gi_interkoneksi': self.gi_interkoneksi,
            'kode_interbus':   self.kode_interbus,
            'kwh_transfer':    float(self.kwh_transfer),
            'arah':            self.arah,
        }

    def __repr__(self):
        return (f'<TransferAntarUnit {self.arah} '
                f'{self.unit_asal}→{self.unit_tujuan} '
                f'{self.periode_bulan}>')


# ─────────────────────────────────────────────────────
# 7. REKAP BULANAN (cache kalkulasi per GI per bulan)
# ─────────────────────────────────────────────────────
class EximRule(db.Model):
    __tablename__ = 'exim_rule'
    __table_args__ = (
        db.UniqueConstraint('kode_rule', name='uq_exim_rule_kode'),
    )

    id              = db.Column(db.Integer, primary_key=True)
    kode_rule       = db.Column(db.String(60), nullable=False)
    nama_rule       = db.Column(db.String(150))
    metode          = db.Column(db.String(30), nullable=False)
    penyulang_id    = db.Column(db.Integer, db.ForeignKey('penyulang.id'),
                                nullable=True)
    gi_id           = db.Column(db.Integer, db.ForeignKey('gardu_induk.id'),
                                nullable=True)
    up3_asal        = db.Column(db.String(100))
    up3_tujuan      = db.Column(db.String(100))
    fungsi          = db.Column(db.String(20))  # KIRIM | TERIMA
    arah            = db.Column(db.String(10))  # EKSPOR | IMPOR
    periode_mulai   = db.Column(db.Date)
    periode_selesai = db.Column(db.Date)
    aktif           = db.Column(db.Boolean, default=True)
    source_sheet    = db.Column(db.String(80))
    source_row      = db.Column(db.Integer)
    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                onupdate=datetime.utcnow)

    penyulang       = db.relationship('Penyulang', backref='exim_rules')
    gardu_induk     = db.relationship('GarduInduk', backref='exim_rules')
    kva_participants = db.relationship('EximKvaParticipant', backref='rule',
                                       lazy=True, cascade='all, delete-orphan')
    customer_charges = db.relationship('EximCustomerCharge', backref='rule',
                                       lazy=True, cascade='all, delete-orphan')
    monthly_results = db.relationship('EximMonthlyResult', backref='rule',
                                      lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'kode_rule': self.kode_rule,
            'nama_rule': self.nama_rule,
            'metode': self.metode,
            'penyulang_id': self.penyulang_id,
            'gi_id': self.gi_id,
            'up3_asal': self.up3_asal,
            'up3_tujuan': self.up3_tujuan,
            'fungsi': self.fungsi,
            'arah': self.arah,
            'aktif': self.aktif,
            'source_sheet': self.source_sheet,
            'source_row': self.source_row,
            'catatan': self.catatan,
        }

    def __repr__(self):
        return f'<EximRule {self.kode_rule} - {self.metode}>'


class EximKvaParticipant(db.Model):
    __tablename__ = 'exim_kva_participant'

    id              = db.Column(db.Integer, primary_key=True)
    rule_id         = db.Column(db.Integer, db.ForeignKey('exim_rule.id',
                                 ondelete='CASCADE'), nullable=False)
    nama_gardu      = db.Column(db.String(150), nullable=False)
    up3             = db.Column(db.String(100), nullable=False)
    fungsi          = db.Column(db.String(20))
    kva_trafo       = db.Column(db.Numeric(12, 2), default=0)
    porsi_override  = db.Column(db.Numeric(10, 6))
    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def porsi_override_float(self):
        if self.porsi_override is None:
            return None
        return float(self.porsi_override)

    def to_dict(self):
        return {
            'id': self.id,
            'rule_id': self.rule_id,
            'nama_gardu': self.nama_gardu,
            'up3': self.up3,
            'fungsi': self.fungsi,
            'kva_trafo': float(self.kva_trafo or 0),
            'porsi_override': self.porsi_override_float,
            'catatan': self.catatan,
        }


class EximCustomerCharge(db.Model):
    __tablename__ = 'exim_customer_charge'

    id              = db.Column(db.Integer, primary_key=True)
    rule_id         = db.Column(db.Integer, db.ForeignKey('exim_rule.id',
                                 ondelete='CASCADE'), nullable=False)
    periode_bulan   = db.Column(db.Date, nullable=False)
    id_pelanggan    = db.Column(db.String(60))
    nama_pelanggan  = db.Column(db.String(150))
    up3_pelanggan   = db.Column(db.String(100))
    kwh_jual        = db.Column(db.Numeric(15, 2), default=0)
    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'rule_id': self.rule_id,
            'periode_bulan': self.periode_bulan.strftime('%Y-%m-%d'),
            'id_pelanggan': self.id_pelanggan,
            'nama_pelanggan': self.nama_pelanggan,
            'up3_pelanggan': self.up3_pelanggan,
            'kwh_jual': float(self.kwh_jual or 0),
            'catatan': self.catatan,
        }


class EximMonthlyResult(db.Model):
    __tablename__ = 'exim_monthly_result'
    __table_args__ = (
        db.UniqueConstraint('rule_id', 'periode_bulan', 'up3_tujuan',
                            name='uq_exim_result_rule_bulan_tujuan'),
    )

    id              = db.Column(db.Integer, primary_key=True)
    rule_id         = db.Column(db.Integer, db.ForeignKey('exim_rule.id',
                                 ondelete='CASCADE'), nullable=False)
    periode_bulan   = db.Column(db.Date, nullable=False)
    metode          = db.Column(db.String(30), nullable=False)
    penyulang_id    = db.Column(db.Integer, db.ForeignKey('penyulang.id'),
                                nullable=True)
    gi_id           = db.Column(db.Integer, db.ForeignKey('gardu_induk.id'),
                                nullable=True)
    up3_asal        = db.Column(db.String(100))
    up3_tujuan      = db.Column(db.String(100))
    fungsi          = db.Column(db.String(20))
    arah            = db.Column(db.String(10))
    kwh_basis       = db.Column(db.Numeric(15, 2), default=0)
    kwh_wbp         = db.Column(db.Numeric(15, 2), default=0)
    kwh_lwbp1       = db.Column(db.Numeric(15, 2), default=0)
    kwh_lwbp2       = db.Column(db.Numeric(15, 2), default=0)
    kwh_transfer    = db.Column(db.Numeric(15, 2), default=0)
    porsi           = db.Column(db.Numeric(10, 6))
    source_sheet    = db.Column(db.String(80))
    source_row      = db.Column(db.Integer)
    versi_hitung    = db.Column(db.String(30), default='nkwh-v1')
    catatan         = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'rule_id': self.rule_id,
            'periode_bulan': self.periode_bulan.strftime('%Y-%m-%d'),
            'metode': self.metode,
            'penyulang_id': self.penyulang_id,
            'gi_id': self.gi_id,
            'up3_asal': self.up3_asal,
            'up3_tujuan': self.up3_tujuan,
            'fungsi': self.fungsi,
            'arah': self.arah,
            'kwh_basis': float(self.kwh_basis or 0),
            'kwh_wbp': float(self.kwh_wbp or 0),
            'kwh_lwbp1': float(self.kwh_lwbp1 or 0),
            'kwh_lwbp2': float(self.kwh_lwbp2 or 0),
            'kwh_transfer': float(self.kwh_transfer or 0),
            'porsi': float(self.porsi) if self.porsi is not None else None,
            'source_sheet': self.source_sheet,
            'source_row': self.source_row,
            'versi_hitung': self.versi_hitung,
            'catatan': self.catatan,
        }


class RekapBulanan(db.Model):
    __tablename__ = 'rekap_bulanan'
    __table_args__ = (
        db.UniqueConstraint('gi_id', 'trafo_id', 'periode_bulan',
                            name='uq_rekap_gi_trafo_bulan'),
    )

    id                       = db.Column(db.Integer, primary_key=True)
    gi_id                    = db.Column(db.Integer,
                               db.ForeignKey('gardu_induk.id'), nullable=False)
    trafo_id                 = db.Column(db.Integer,
                               db.ForeignKey('trafo.id'), nullable=True)
                               # NULL = rekap level GI (semua trafo digabung)
    periode_bulan            = db.Column(db.Date, nullable=False)

    kwh_mu_total             = db.Column(db.Numeric(15, 2))
    kwh_mp_total             = db.Column(db.Numeric(15, 2))
    kwh_penyulang_total      = db.Column(db.Numeric(15, 2))

    deviasi_mu_mp            = db.Column(db.Numeric(8, 4))   # persen
    deviasi_mu_penyulang     = db.Column(db.Numeric(8, 4))   # persen

    susut_kwh                = db.Column(db.Numeric(15, 2))
    susut_persen             = db.Column(db.Numeric(8, 4))

    transfer_ekspor          = db.Column(db.Numeric(15, 2), default=0)
    transfer_impor           = db.Column(db.Numeric(15, 2), default=0)

    created_at               = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at               = db.Column(db.DateTime, default=datetime.utcnow,
                                         onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':                   self.id,
            'gi_id':                self.gi_id,
            'trafo_id':             self.trafo_id,
            'periode_bulan':        self.periode_bulan.strftime('%Y-%m-%d'),
            'kwh_mu_total':         float(self.kwh_mu_total        or 0),
            'kwh_mp_total':         float(self.kwh_mp_total        or 0),
            'kwh_penyulang_total':  float(self.kwh_penyulang_total or 0),
            'deviasi_mu_mp':        float(self.deviasi_mu_mp       or 0),
            'deviasi_mu_penyulang': float(self.deviasi_mu_penyulang or 0),
            'susut_kwh':            float(self.susut_kwh           or 0),
            'susut_persen':         float(self.susut_persen        or 0),
            'transfer_ekspor':      float(self.transfer_ekspor     or 0),
            'transfer_impor':       float(self.transfer_impor      or 0),
        }

    def __repr__(self):
        return (f'<RekapBulanan gi={self.gi_id} '
                f'bulan={self.periode_bulan} '
                f'susut={self.susut_persen}%>')
