import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AppLayout } from "@/components/layout";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aplikasi Monitoring Susut Energi",
  description: "Dashboard internal monitoring kWh, susut jaringan, deviasi, dan workflow data bulanan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AntdRegistry>
          <AppProviders>
            <AppLayout>{children}</AppLayout>
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
