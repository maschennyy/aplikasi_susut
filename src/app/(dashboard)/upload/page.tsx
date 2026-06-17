import { Upload } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function UploadPage() {
  return (
    <ModulePlaceholderPage
      description="Pusat upload data NKWh dan file operasional untuk workflow bulanan."
      icon={Upload}
      title="Upload Data"
      scope={[
        {
          title: "Upload NKWh",
          description: "Analisis dan import workbook NKWh untuk meter, penyulang, dan EXIM.",
        },
        {
          title: "Validasi file",
          description: "Ringkasan error, jumlah baris, dan blocker sebelum data masuk database.",
        },
        {
          title: "Workflow bulanan",
          description: "Koneksi upload dengan status draft, pending, final, dan locked.",
        },
      ]}
    />
  );
}
