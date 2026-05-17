"""
app.py — Aplikasi Susut Energi
Model sudah diperbarui ke skema lengkap (GarduInduk, Trafo, Penyulang, dll).
"""

from flask import Flask, render_template, jsonify, request
from config import Config
from models import (db, GarduInduk, Trafo, Penyulang,
                    MeterReading, FeederReading,
                    TransferAntarUnit, RekapBulanan)
from sqlalchemy import func
from datetime import date
import os

app = Flask(__name__)
app.config.from_object(Config)
Config.validate()
db.init_app(app)

with app.app_context():
    db.create_all()


# ════════════════════════════════════════════════
# ROUTES — HALAMAN
# ════════════════════════════════════════════════

@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/penyulang')
def halaman_penyulang():
    return render_template('penyulang.html')


# ════════════════════════════════════════════════
# API — MASTER DATA
# ════════════════════════════════════════════════

@app.route('/api/gardu-induk')
def api_gardu_induk():
    """Daftar semua Gardu Induk aktif."""
    try:
        gis = GarduInduk.query.filter_by(aktif=True).order_by(GarduInduk.nama_gi).all()
        return jsonify([g.to_dict() for g in gis])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/trafo')
def api_trafo():
    """Daftar trafo, opsional filter by gi_id."""
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
    """Daftar penyulang, opsional filter by trafo_id atau gi_id."""
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
    """
    Data utama dashboard: total kWh MU, penyulang, dan susut per bulan.
    Opsional filter: ?tahun=2025
    """
    try:
        tahun = request.args.get('tahun', type=int)

        # Subquery: total kWh MU per bulan (sum semua trafo)
        sub_mu = db.session.query(
            MeterReading.periode_bulan,
            func.sum(
                func.coalesce(MeterReading.mu_kwh_wbp,   0) +
                func.coalesce(MeterReading.mu_kwh_lwbp1, 0) +
                func.coalesce(MeterReading.mu_kwh_lwbp2, 0)
            ).label('total_mu')
        ).group_by(MeterReading.periode_bulan)

        # Subquery: total kWh penyulang per bulan
        sub_py = db.session.query(
            FeederReading.periode_bulan,
            func.sum(
                func.coalesce(FeederReading.kwh_wbp,   0) +
                func.coalesce(FeederReading.kwh_lwbp1, 0) +
                func.coalesce(FeederReading.kwh_lwbp2, 0)
            ).label('total_penyulang')
        ).group_by(FeederReading.periode_bulan)

        if tahun:
            sub_mu = sub_mu.filter(
                func.extract('year', MeterReading.periode_bulan) == tahun)
            sub_py = sub_py.filter(
                func.extract('year', FeederReading.periode_bulan) == tahun)

        sub_mu = sub_mu.subquery()
        sub_py = sub_py.subquery()

        rows = db.session.query(
            sub_mu.c.periode_bulan,
            sub_mu.c.total_mu,
            func.coalesce(sub_py.c.total_penyulang, 0).label('total_penyulang')
        ).outerjoin(
            sub_py,
            sub_mu.c.periode_bulan == sub_py.c.periode_bulan
        ).order_by(sub_mu.c.periode_bulan).all()

        data = []
        t_mu = t_py = 0
        for r in rows:
            mu   = float(r.total_mu)
            py   = float(r.total_penyulang)
            sk   = mu - py
            pct  = round(sk / mu * 100, 2) if mu > 0 else 0
            t_mu += mu
            t_py += py
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
# API — FEEDER READINGS (data per penyulang)
# ════════════════════════════════════════════════

@app.route('/api/feeder-data')
def api_feeder_data():
    """
    Data feeder per GI / Trafo / Bulan.
    Query params: gi_id, trafo_id, bulan (YYYY-MM)
    """
    try:
        gi_id    = request.args.get('gi_id',    type=int)
        trafo_id = request.args.get('trafo_id', type=int)
        bulan    = request.args.get('bulan')    # format: '2025-05'

        q = db.session.query(FeederReading, Penyulang)\
              .join(Penyulang, FeederReading.penyulang_id == Penyulang.id)

        if gi_id:
            q = q.filter(FeederReading.gi_id == gi_id)
        if trafo_id:
            q = q.filter(FeederReading.trafo_id == trafo_id)
        if bulan:
            tahun, bln = bulan.split('-')
            q = q.filter(
                func.extract('year',  FeederReading.periode_bulan) == int(tahun),
                func.extract('month', FeederReading.periode_bulan) == int(bln)
            )

        rows = q.order_by(Penyulang.kode_penyulang).all()

        result = []
        for fr, py in rows:
            d = fr.to_dict()
            d['kode_penyulang'] = py.kode_penyulang
            d['nama_penyulang'] = py.nama_penyulang
            result.append(d)

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — METER READING (MU vs MP per trafo)
# ════════════════════════════════════════════════

@app.route('/api/meter-data')
def api_meter_data():
    """
    Data Meter Utama & Pembanding per trafo per bulan.
    Query params: gi_id, trafo_id, bulan (YYYY-MM)
    """
    try:
        gi_id    = request.args.get('gi_id',    type=int)
        trafo_id = request.args.get('trafo_id', type=int)
        bulan    = request.args.get('bulan')

        q = db.session.query(MeterReading, Trafo, GarduInduk)\
              .join(Trafo,      MeterReading.trafo_id == Trafo.id)\
              .join(GarduInduk, MeterReading.gi_id    == GarduInduk.id)

        if gi_id:
            q = q.filter(MeterReading.gi_id == gi_id)
        if trafo_id:
            q = q.filter(MeterReading.trafo_id == trafo_id)
        if bulan:
            tahun, bln = bulan.split('-')
            q = q.filter(
                func.extract('year',  MeterReading.periode_bulan) == int(tahun),
                func.extract('month', MeterReading.periode_bulan) == int(bln)
            )

        rows = q.order_by(MeterReading.periode_bulan).all()

        result = []
        for mr, tr, gi in rows:
            d = mr.to_dict()
            d['kode_trafo'] = tr.kode_trafo
            d['nama_trafo'] = tr.nama_trafo
            d['nama_gi']    = gi.nama_gi
            result.append(d)

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — TRANSFER ANTAR UNIT
# ════════════════════════════════════════════════

@app.route('/api/transfer-data')
def api_transfer_data():
    """Data transfer antar unit (EXIM). Filter: bulan (YYYY-MM), tahun."""
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
            q = q.filter(
                func.extract('year', TransferAntarUnit.periode_bulan) == tahun)

        rows = q.order_by(TransferAntarUnit.periode_bulan).all()
        return jsonify([r.to_dict() for r in rows])

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# API — REKAP BULANAN
# ════════════════════════════════════════════════

@app.route('/api/rekap')
def api_rekap():
    """Rekap bulanan per GI. Filter: tahun, gi_id."""
    try:
        tahun = request.args.get('tahun', type=int)
        gi_id = request.args.get('gi_id', type=int)

        q = db.session.query(RekapBulanan, GarduInduk)\
              .join(GarduInduk, RekapBulanan.gi_id == GarduInduk.id)\
              .filter(RekapBulanan.trafo_id == None)  # level GI

        if tahun:
            q = q.filter(
                func.extract('year', RekapBulanan.periode_bulan) == tahun)
        if gi_id:
            q = q.filter(RekapBulanan.gi_id == gi_id)

        rows = q.order_by(RekapBulanan.periode_bulan).all()

        result = []
        for rb, gi in rows:
            d = rb.to_dict()
            d['nama_gi']   = gi.nama_gi
            d['kode_gi']   = gi.kode_gi
            result.append(d)

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════
# JALANKAN
# ════════════════════════════════════════════════

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)