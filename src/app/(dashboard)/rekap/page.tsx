import { ClipboardList } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function RekapPage() {
  return (
    <ModulePlaceholderPage
      description="Rekap bulanan energi masuk, energi keluar, susut kWh, susut persen, dan transfer untuk pelaporan operasional."
      icon={ClipboardList}
      title="Rekap"
      scope={[
        {
          title: "Rekap GI",
          description: "Ringkasan kWh utama, pembanding, penyulang, dan susut per gardu induk.",
        },
        {
          title: "Rekap trafo",
          description: "Detail rekap per trafo untuk investigasi deviasi dan anomali.",
        },
        {
          title: "Export laporan",
          description: "Unduhan rekap dalam format spreadsheet sesuai periode terpilih.",
        },
      ]}
    />
  );
}
