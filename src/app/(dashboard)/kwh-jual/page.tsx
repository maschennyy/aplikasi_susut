import { ShoppingCart } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function KwhJualPage() {
  return (
    <ModulePlaceholderPage
      description="Pencatatan dan pemantauan kWh jual per gardu induk, periode, golongan, dan sub-golongan pelanggan."
      icon={ShoppingCart}
      title="kWh Jual"
      scope={[
        {
          title: "Input kWh jual",
          description: "Form pencatatan kWh jual berdasarkan golongan dan periode.",
        },
        {
          title: "Tabel penjualan",
          description: "Daftar kWh jual yang dapat difilter berdasarkan GI dan bulan.",
        },
        {
          title: "Validasi rekap",
          description: "Pemeriksaan kWh jual terhadap rekap susut dan laporan bulanan.",
        },
      ]}
    />
  );
}
