"""
app.py v5 — Aplikasi Susut Energi
Semua route yang direferensikan di base.html sudah ada.
"""

from flask import Flask, render_template, jsonify, request, flash, redirect, url_for
from config import Config
from models import (db, GarduInduk, Trafo, Penyulang,
                    MeterReading, FeederReading,
                    TransferAntarUnit, RekapBulanan)
from sqlalchemy import func
import os

app = Flask(__name__)
app.config.from_object(Config)
Config.validate()
db.init_app(app)

with app.app_context():
    db.create_all()


# ════════════════════════════════════════════════
# HALAMAN — semua route yang ada di sidebar
# ════════════════════════════════════════════════

@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/penyulang')
def halaman_penyulang():
    return render_template('penyulang.html',
        eyebrow='Monitoring', judul='kWh Penyulang',
        icon='plug', desc='Data pembacaan meter per penyulang.')

@app.route('/meter-gi')
def halaman_meter_gi():
    return render_template('meter_gi.html',
        eyebrow='Monitoring', judul='Main Meter GI',
        icon='gauge', desc='Data Meter Utama dan Meter Pembanding per Gardu Induk.')

@app.route('/deviasi')
def halaman_deviasi():
    return render_template('deviasi.html',
        eyebrow='Analisis', judul='Analisis Deviasi',
        icon='chart-bar', desc='Perbandingan MU vs MP vs total penyulang.')

@app.route('/proporsional')
def halaman_proporsional():
    return render_template('proporsional.html',
        eyebrow='Analisis', judul='Detail Proporsional',
        icon='percentage', desc='Alokasi energi proporsional per penyulang.')

@app.route('/transfer')
def halaman_transfer():
    return render_template('transfer.html',
        eyebrow='Analisis', judul='Transfer EXIM',
        icon='arrows-exchange', desc='Monitoring ekspor dan impor energi antar unit.')

@app.route('/rekap')
def halaman_rekap():
    return render_template('rekap.html',
        eyebrow='Laporan', judul='Rekapitulasi Bulanan',
        icon='report', desc='Rekap kWh dan susut per GI per bulan.')

@app.route('/upload')
def halaman_upload():
    return render_template('upload.html',
        eyebrow='Laporan', judul='Upload NKWh',
        icon='upload', desc='Upload file NKWh Excel/CSV untuk import data penyulang.')


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
        q = Penyulang.query.filter_by(aktif=True)
        if trafo_id:
            q = q.filter_by(trafo_id=trafo_id)
        if gi_id:
            q = q.filter_by(gi_id=gi_id)
        return jsonify([p.to_dict() for p in q.order_by(Penyulang.kode_penyulang).all()])
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
        bulan    = request.args.get('bulan')

        q = db.session.query(FeederReading, Penyulang)\
              .join(Penyulang, FeederReading.penyulang_id == Penyulang.id)
        if gi_id:    q = q.filter(FeederReading.gi_id    == gi_id)
        if trafo_id: q = q.filter(FeederReading.trafo_id == trafo_id)
        if bulan:
            thn, bln = bulan.split('-')
            q = q.filter(
                func.extract('year',  FeederReading.periode_bulan) == int(thn),
                func.extract('month', FeederReading.periode_bulan) == int(bln)
            )

        result = []
        for fr, py in q.order_by(Penyulang.kode_penyulang).all():
            d = fr.to_dict()
            d['kode_penyulang'] = py.kode_penyulang
            d['nama_penyulang'] = py.nama_penyulang
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
              .filter(RekapBulanan.trafo_id == None)
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

@app.route('/api/upload', methods=['POST'])
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

    # TODO: integrasikan dengan UploadEngine dari upload_engine.py
    # from upload_engine import UploadEngine
    # engine = UploadEngine()
    # result = engine.proses(tmp_path, gi_id, trafo_id, periode)
    return jsonify({'message': 'Upload endpoint aktif. Integrasi UploadEngine belum selesai.'}), 200


# ════════════════════════════════════════════════
# ERROR HANDLERS
# ════════════════════════════════════════════════

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