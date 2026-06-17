import { ArrowLeftRight } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function TransferAntarUidPage() {
  return (
    <ModulePlaceholderPage
      description="Monitoring energi transfer antar UID atau unit terkait untuk memastikan arus ekspor-impor tercatat konsisten."
      icon={ArrowLeftRight}
      title="Transfer Antar UID"
      scope={[
        {
          title: "Daftar transfer",
          description: "Tabel transfer energi berdasarkan unit asal, unit tujuan, GI interkoneksi, dan periode.",
        },
        {
          title: "Arah energi",
          description: "Pemantauan ekspor dan impor antar unit agar tidak dobel hitung.",
        },
        {
          title: "Rekonsiliasi",
          description: "Pemeriksaan total transfer terhadap rekap susut bulanan.",
        },
      ]}
    />
  );
}
