import { Database } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function MasterDataPage() {
  return (
    <ModulePlaceholderPage
      description="Pengelolaan data referensi utama seperti area unit, gardu induk, trafo, dan penyulang."
      icon={Database}
      title="Master Data"
      scope={[
        {
          title: "Area unit",
          description: "CRUD unit organisasi dan pemetaan area operasional.",
        },
        {
          title: "Gardu induk dan trafo",
          description: "CRUD GI, trafo, kapasitas, status aktif, dan relasi unit.",
        },
        {
          title: "Penyulang",
          description: "CRUD penyulang, status, area UP3, dan relasi ke trafo.",
        },
      ]}
    />
  );
}
