import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import styles from "./module-placeholder.module.css";

type ScopeItem = {
  title: string;
  description: string;
};

type ModulePlaceholderPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  statusLabel?: string;
  scope: ScopeItem[];
};

export function ModulePlaceholderPage({
  title,
  description,
  icon: Icon,
  statusLabel = "Belum tersedia di frontend",
  scope,
}: ModulePlaceholderPageProps) {
  return (
    <div className={styles.pageStack}>
      <section className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>Modul aplikasi</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{description}</p>
        </div>
        <span className={styles.statusPill}>{statusLabel}</span>
      </section>

      <section className={styles.statusBand}>
        <span className={styles.iconWrap}>
          <Icon aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
        <div>
          <h2 className={styles.statusTitle}>Halaman sedang disiapkan</h2>
          <p className={styles.statusDescription}>
            Navigasi untuk modul ini sudah tersedia agar struktur aplikasi lengkap. Implementasi tabel,
            filter, form, dan aksi operasional akan dipasang pada halaman ini.
          </p>
          <div className={styles.actionRow}>
            <Link className={styles.primaryLink} href="/dashboard">
              Kembali ke Dashboard
            </Link>
            <Link className={styles.secondaryLink} href="/penyulang">
              Buka kWh Penyulang
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.pageStack}>
        <h2 className={styles.sectionTitle}>Cakupan modul</h2>
        <div className={styles.scopeGrid}>
          {scope.map((item) => (
            <div className={styles.scopeItem} key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
