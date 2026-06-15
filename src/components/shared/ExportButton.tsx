"use client";

import { useState } from "react";
import { App, Button } from "antd";
import type { ButtonProps } from "antd";
import { Download } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";

type ExportButtonProps = Omit<ButtonProps, "href" | "loading" | "onClick"> & {
  endpoint: string;
  filename: string;
  params?: Record<string, string | number | null | undefined>;
};

function filenameFromDisposition(disposition: unknown) {
  if (typeof disposition !== "string") return null;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function ExportButton({ endpoint, filename, params, children = "Export", ...buttonProps }: ExportButtonProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await api.get<Blob>(endpoint, {
        params,
        responseType: "blob",
      });
      const responseFilename = filenameFromDisposition(response.headers["content-disposition"]) ?? filename;
      triggerDownload(response.data, responseFilename);
      void message.success("File export sedang diunduh.");
    } catch (error) {
      void message.error(apiErrorMessage(error, "Gagal mengunduh file export."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<Download aria-hidden="true" size={16} />}
      loading={loading}
      onClick={handleExport}
      {...buttonProps}
    >
      {children}
    </Button>
  );
}
