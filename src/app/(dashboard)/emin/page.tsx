import { Activity } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function EminPage() {
  return (
    <ModulePlaceholderPage
      description="Monitoring EMIN untuk membedakan susut dengan dan tanpa koreksi energi minimum."
      icon={Activity}
      title="EMIN"
      scope={[
        {
          title: "Energi minimum",
          description: "Pencatatan komponen EMIN yang memengaruhi perhitungan susut.",
        },
        {
          title: "Susut tanpa EMIN",
          description: "Perbandingan susut operasional sebelum dan sesudah koreksi.",
        },
        {
          title: "Rekap kumulatif",
          description: "Akumulasi EMIN per periode untuk evaluasi bulanan.",
        },
      ]}
    />
  );
}
