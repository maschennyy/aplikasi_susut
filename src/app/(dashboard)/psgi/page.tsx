import { BarChart2 } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function PsgiPage() {
  return (
    <ModulePlaceholderPage
      description="Pemantauan indikator PSGI sebagai bagian dari evaluasi performa susut energi per gardu induk."
      icon={BarChart2}
      title="PSGI"
      scope={[
        {
          title: "Indikator PSGI",
          description: "Ringkasan metrik PSGI berdasarkan periode dan gardu induk.",
        },
        {
          title: "Perbandingan tren",
          description: "Grafik tren PSGI antar bulan untuk melihat perubahan performa.",
        },
        {
          title: "Daftar prioritas",
          description: "Identifikasi GI yang perlu tindak lanjut berdasarkan nilai indikator.",
        },
      ]}
    />
  );
}
