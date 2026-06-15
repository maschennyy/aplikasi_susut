"use client";

import type { ReactNode } from "react";
import { App, ConfigProvider, theme } from "antd";
import idID from "antd/locale/id_ID";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ConfigProvider
      locale={idID}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#073b86",
          colorSuccess: "#12805c",
          colorWarning: "#d78312",
          colorError: "#d33f49",
          colorInfo: "#00a3d7",
          colorBgLayout: "#f4f7fb",
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorBorder: "#d9e3ef",
          colorBorderSecondary: "#e7edf5",
          colorText: "#102033",
          colorTextSecondary: "#64748b",
          colorTextTertiary: "#8392a6",
          controlHeight: 38,
          controlHeightLG: 44,
          borderRadius: 8,
          fontFamily:
            "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          fontSize: 14,
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 38,
            fontWeight: 650,
            primaryShadow: "0 10px 22px rgba(7, 59, 134, 0.18)",
          },
          Table: {
            borderColor: "#e7edf5",
            cellPaddingBlock: 10,
            cellPaddingInline: 12,
            headerBg: "#f6f9fd",
            headerColor: "#314056",
            rowHoverBg: "#f6fbff",
          },
          Card: {
            boxShadowTertiary: "0 18px 50px rgba(13, 31, 58, 0.06)",
            borderRadiusLG: 8,
          },
          Menu: {
            itemBorderRadius: 8,
            itemColor: "#475569",
            itemHoverBg: "#edf6ff",
            itemHoverColor: "#073b86",
            itemSelectedBg: "#e9f5ff",
            itemSelectedColor: "#073b86",
          },
          Select: {
            optionSelectedBg: "#e9f5ff",
          },
          DatePicker: {
            activeBorderColor: "#00a3d7",
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
