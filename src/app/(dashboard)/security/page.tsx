import { Shield } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function SecurityPage() {
  return (
    <ModulePlaceholderPage
      description="Administrasi user, role, audit log, dan kontrol akses modul untuk keamanan aplikasi internal."
      icon={Shield}
      title="Security"
      scope={[
        {
          title: "User admin",
          description: "Pengelolaan user, role, status aktif, dan reset password.",
        },
        {
          title: "Audit log",
          description: "Pelacakan aktivitas login, import, update data, dan perubahan security.",
        },
        {
          title: "Akses modul",
          description: "Ringkasan hak akses admin, operator, viewer, dan auditor.",
        },
      ]}
    />
  );
}
