from flask import Flask, render_template, jsonify, request
from config import Config
from models import db, MeterUtama, Penyulang
from sqlalchemy import func
from datetime import datetime
import random

# Inisialisasi aplikasi
app = Flask(__name__)
app.config.from_object(Config)

# Inisialisasi database
db.init_app(app)

# Buat tabel saat pertama kali jalan
with app.app_context():
    db.create_all()

# ============================================
# ROUTES (HALAMAN)
# ============================================

@app.route('/')
def dashboard():
    """Halaman utama dashboard"""
    return render_template('dashboard.html')

@app.route('/penyulang')
def halaman_penyulang():
    """Halaman data penyulang"""
    return render_template('penyulang.html')

# ============================================
# API ENDPOINTS (DATA JSON)
# ============================================

@app.route('/api/dashboard-data')
def get_dashboard_data():
    """API untuk data dashboard"""
    # Query data per bulan
    query = db.session.query(
        MeterUtama.tanggal,
        func.sum(MeterUtama.kwh_meter_utama).label('total_meter_utama'),
        func.coalesce(func.sum(Penyulang.kwh_penyulang), 0).label('total_penyulang')
    ).outerjoin(
        Penyulang, MeterUtama.tanggal == Penyulang.tanggal
    ).group_by(
        MeterUtama.tanggal
    ).order_by(
        MeterUtama.tanggal
    ).all()
    
    data = []
    total_meter = 0
    total_penyulang = 0
    
    for row in query:
        susut_kwh = row.total_meter_utama - row.total_penyulang
        persentase = (susut_kwh / row.total_meter_utama * 100) if row.total_meter_utama > 0 else 0
        
        total_meter += row.total_meter_utama
        total_penyulang += row.total_penyulang
        
        data.append({
            'tanggal': row.tanggal.strftime('%Y-%m-%d'),
            'meter_utama': float(row.total_meter_utama),
            'total_penyulang': float(row.total_penyulang),
            'susut_kwh': float(susut_kwh),
            'persentase_susut': float(round(persentase, 2))
        })
    
    total_susut = total_meter - total_penyulang
    persentase_total = (total_susut / total_meter * 100) if total_meter > 0 else 0
    
    return jsonify({
        'data_bulanan': data,
        'total': {
            'meter_utama': total_meter,
            'total_penyulang': total_penyulang,
            'total_susut': total_susut,
            'persentase_total': round(persentase_total, 2)
        }
    })

@app.route('/api/penyulang-data')
def api_penyulang():
    """API untuk data penyulang (Dummy Data Sementara)"""
    gardu = request.args.get('gardu', 'GI Cawang')
    tahun = request.args.get('tahun', 2026, type=int)
    
    random.seed(f"{gardu}{tahun}")
    
    penyulang_list = []
    for i in range(1, 16):
        data = {
            'nama': f'{gardu} - Penyulang {i:02d}',
            'bulanan': [round(random.uniform(8000, 15000), 2) for _ in range(12)]
        }
        data['total'] = round(sum(data['bulanan']), 2)
        penyulang_list.append(data)
    
    return jsonify({
        'gardu': gardu,
        'tahun': tahun,
        'penyulang': penyulang_list
    })

# ============================================
# JALANKAN APLIKASI
# ============================================
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)