import { Scale } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function ProporsionalPage() {
  return (
    <ModulePlaceholderPage
      description="Pemantauan pembagian proporsional energi dan susut untuk membantu rekonsiliasi antar titik ukur."
      icon={Scale}
      title="Proporsional"
      scope={[
        {
          title: "Alokasi energi",
          description: "Pembagian kWh berdasarkan kontribusi trafo, penyulang, atau unit terkait.",
        },
        {
          title: "Validasi proporsi",
          description: "Perbandingan hasil alokasi dengan total energi masuk dan keluar.",
        },
        {
          title: "Rekap periode",
          description: "Ringkasan proporsional per bulan untuk kebutuhan pelaporan internal.",
        },
      ]}
    />
  );
}
