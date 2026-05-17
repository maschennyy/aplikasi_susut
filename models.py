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

db = SQLAlchemy()


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
    aktif           = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                onupdate=datetime.utcnow)

    # Relasi
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

    # Flag otomatis jika deviasi melebihi threshold
    flag_alert      = db.Column(db.Boolean, default=False)
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
            'flag_alert':     self.flag_alert,
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