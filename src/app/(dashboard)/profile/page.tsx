import { User } from "lucide-react";
import { ModulePlaceholderPage } from "@/components/shared/ModulePlaceholderPage";

export default function ProfilePage() {
  return (
    <ModulePlaceholderPage
      description="Pengaturan profil pengguna, informasi akun, dan perubahan password pribadi."
      icon={User}
      title="Profile"
      scope={[
        {
          title: "Informasi akun",
          description: "Nama lengkap, username, email, role, dan status akun.",
        },
        {
          title: "Ubah profil",
          description: "Form pembaruan data profil yang aman untuk user aktif.",
        },
        {
          title: "Ubah password",
          description: "Perubahan password dengan validasi policy keamanan backend.",
        },
      ]}
    />
  );
}
