from flask import Flask, render_template, jsonify, request
from config import Config
from models import db, MeterUtama, Penyulang
from sqlalchemy import func
import os

# Inisialisasi aplikasi
app = Flask(__name__)
app.config.from_object(Config)

# Validasi konfigurasi saat startup
Config.validate()

# Inisialisasi database
db.init_app(app)

with app.app_context():
    db.create_all()

# ============================================
# ROUTES (HALAMAN)
# ============================================

@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/penyulang')
def halaman_penyulang():
    return render_template('penyulang.html')

# ============================================
# API ENDPOINTS
# ============================================

@app.route('/api/dashboard-data')
def get_dashboard_data():
    try:
        # --- PERBAIKAN: subquery terpisah agar SUM tidak terduplikasi ---
        sub_penyulang = db.session.query(
            Penyulang.tanggal,
            func.sum(Penyulang.kwh_penyulang).label('total_penyulang')
        ).group_by(Penyulang.tanggal).subquery()

        query = db.session.query(
            MeterUtama.tanggal,
            MeterUtama.kwh_meter_utama,
            func.coalesce(sub_penyulang.c.total_penyulang, 0).label('total_penyulang')
        ).outerjoin(
            sub_penyulang,
            MeterUtama.tanggal == sub_penyulang.c.tanggal
        ).order_by(MeterUtama.tanggal).all()

        data = []
        total_meter = 0
        total_penyulang_sum = 0

        for row in query:
            susut_kwh  = row.kwh_meter_utama - row.total_penyulang
            persentase = (susut_kwh / row.kwh_meter_utama * 100) if row.kwh_meter_utama > 0 else 0
            total_meter        += row.kwh_meter_utama
            total_penyulang_sum += row.total_penyulang
            data.append({
                'tanggal':          row.tanggal.strftime('%Y-%m-%d'),
                'meter_utama':      float(row.kwh_meter_utama),
                'total_penyulang':  float(row.total_penyulang),
                'susut_kwh':        float(susut_kwh),
                'persentase_susut': float(round(persentase, 2))
            })

        total_susut = total_meter - total_penyulang_sum
        persen_total = (total_susut / total_meter * 100) if total_meter > 0 else 0

        return jsonify({
            'data_bulanan': data,
            'total': {
                'meter_utama':      total_meter,
                'total_penyulang':  total_penyulang_sum,
                'total_susut':      total_susut,
                'persentase_total': round(persen_total, 2)
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/penyulang-data')
def api_penyulang():
    """
    API data penyulang — saat ini masih dummy.
    Akan diganti data real setelah model diperbarui (Sesi berikutnya).
    """
    try:
        gardu = request.args.get('gardu', 'GI Cawang')
        tahun = request.args.get('tahun', 2026, type=int)

        # TODO: ganti dengan query ke database setelah model diperbarui
        import random
        random.seed(f"{gardu}{tahun}")
        penyulang_list = []
        for i in range(1, 16):
            data = {
                'nama':    f'{gardu} - Penyulang {i:02d}',
                'bulanan': [round(random.uniform(8000, 15000), 2) for _ in range(12)]
            }
            data['total'] = round(sum(data['bulanan']), 2)
            penyulang_list.append(data)

        return jsonify({'gardu': gardu, 'tahun': tahun, 'penyulang': penyulang_list})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# JALANKAN APLIKASI
# ============================================
if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)