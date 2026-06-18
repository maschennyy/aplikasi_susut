"""add reading pagination indexes

Revision ID: 9f4b27a6c3d1
Revises: 6bfce6fcdecb
Create Date: 2026-06-18 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '9f4b27a6c3d1'
down_revision = '6bfce6fcdecb'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_meter_reading_periode_bulan', 'meter_reading', ['periode_bulan'])
    op.create_index('ix_meter_reading_gi_periode_bulan', 'meter_reading', ['gi_id', 'periode_bulan'])
    op.create_index('ix_meter_reading_trafo_periode_bulan', 'meter_reading', ['trafo_id', 'periode_bulan'])

    op.create_index('ix_feeder_reading_periode_bulan', 'feeder_reading', ['periode_bulan'])
    op.create_index('ix_feeder_reading_gi_periode_bulan', 'feeder_reading', ['gi_id', 'periode_bulan'])
    op.create_index('ix_feeder_reading_trafo_periode_bulan', 'feeder_reading', ['trafo_id', 'periode_bulan'])


def downgrade():
    op.drop_index('ix_feeder_reading_trafo_periode_bulan', table_name='feeder_reading')
    op.drop_index('ix_feeder_reading_gi_periode_bulan', table_name='feeder_reading')
    op.drop_index('ix_feeder_reading_periode_bulan', table_name='feeder_reading')

    op.drop_index('ix_meter_reading_trafo_periode_bulan', table_name='meter_reading')
    op.drop_index('ix_meter_reading_gi_periode_bulan', table_name='meter_reading')
    op.drop_index('ix_meter_reading_periode_bulan', table_name='meter_reading')
