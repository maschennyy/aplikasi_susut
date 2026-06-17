import { FileText } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function TransferEximPage() {
  return (
    <ModulePlaceholderPage
      description="Pengelolaan data transfer EXIM dari sumber NKWh dan rule per penyulang atau gardu induk."
      icon={FileText}
      title="Transfer EXIM"
      scope={[
        {
          title: "Rule EXIM",
          description: "Daftar rule ekspor-impor, metode hitung, arah energi, dan periode berlaku.",
        },
        {
          title: "Hasil bulanan",
          description: "Rekap hasil perhitungan EXIM per periode dan area tujuan.",
        },
        {
          title: "Audit sumber",
          description: "Pelacakan sheet, baris sumber, dan catatan validasi dari import NKWh.",
        },
      ]}
    />
  );
}
