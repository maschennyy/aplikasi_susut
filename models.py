from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class MeterUtama(db.Model):
    __tablename__ = 'meter_utama'
    
    id = db.Column(db.Integer, primary_key=True)
    tanggal = db.Column(db.Date, nullable=False)
    kwh_meter_utama = db.Column(db.Float, nullable=False)
    keterangan = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relasi ke penyulang
    penyulangs = db.relationship('Penyulang', backref='meter_utama', lazy=True)

class Penyulang(db.Model):
    __tablename__ = 'penyulang'
    
    id = db.Column(db.Integer, primary_key=True)
    nama_penyulang = db.Column(db.String(100), nullable=False)
    tanggal = db.Column(db.Date, nullable=False)
    kwh_penyulang = db.Column(db.Float, nullable=False)
    meter_utama_id = db.Column(db.Integer, db.ForeignKey('meter_utama.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)