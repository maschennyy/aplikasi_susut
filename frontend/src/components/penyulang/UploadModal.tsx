"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Descriptions, List, Modal, Progress, Upload, Typography } from "antd";
import type { UploadFile, UploadProps } from "antd";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { FeederFilters } from "@/hooks/useFeederData";
import styles from "./penyulang.module.css";

const { Dragger } = Upload;
const { Text } = Typography;

type UploadModalProps = {
  open: boolean;
  filters: FeederFilters;
  onClose: () => void;
  onUploaded: () => Promise<void>;
};

type UploadResult = {
  message: string;
  importedCount: number;
  errorCount: number;
  alertCount: number;
  errors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function monthParam(period: string) {
  return `${period.slice(0, 4)}-${period.slice(4, 6)}`;
}

function normalizeErrors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (isRecord(item)) {
      const row = item.baris || item.row || item.line;
      const message = item.error || item.message || "Kesalahan tidak diketahui";
      return row ? `Baris ${row}: ${message}` : String(message);
    }
    return String(item);
  });
}

function normalizeResult(data: unknown): UploadResult {
  const raw = isRecord(data) ? data : {};
  const created = toNumber(raw.created);
  const updated = toNumber(raw.updated);

  return {
    message: typeof raw.message === "string" ? raw.message : "Upload penyulang selesai.",
    importedCount: toNumber(raw.imported_count, created + updated),
    errorCount: toNumber(raw.error_count),
    alertCount: toNumber(raw.alerts),
    errors: normalizeErrors(raw.errors),
  };
}

export function UploadModal({ open, filters, onClose, onUploaded }: UploadModalProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const uploadProps = useMemo<UploadProps>(
    () => ({
      accept: ".csv,.xlsx,.xls",
      beforeUpload: (file) => {
        setSelectedFile(file);
        setFileList([file]);
        setError(null);
        setResult(null);
        return false;
      },
      disabled: uploading,
      fileList,
      maxCount: 1,
      multiple: false,
      onRemove: () => {
        setSelectedFile(null);
        setFileList([]);
        setResult(null);
        return true;
      },
    }),
    [fileList, uploading],
  );

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Pilih file CSV atau Excel terlebih dahulu.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("periode", filters.periode);
    formData.append("bulan", monthParam(filters.periode));
    if (filters.giId) formData.append("gi_id", String(filters.giId));
    if (filters.trafoId) formData.append("trafo_id", String(filters.trafoId));

    try {
      const response = await api.post<unknown>("/upload-penyulang", formData, {
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      setProgress(100);
      setResult(normalizeResult(response.data));
      await onUploaded();
    } catch (uploadError) {
      setError(apiErrorMessage(uploadError, "Upload data penyulang gagal."));
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    onClose();
  };

  return (
    <Modal
      destroyOnHidden
      footer={[
        <Button key="close" disabled={uploading} onClick={handleClose}>
          Tutup
        </Button>,
        <Button key="upload" disabled={!selectedFile} loading={uploading} type="primary" onClick={handleUpload}>
          Upload
        </Button>,
      ]}
      open={open}
      title="Upload Data Penyulang"
      width={680}
      onCancel={handleClose}
    >
      <div className={styles.uploadStack}>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <UploadCloud aria-hidden="true" size={34} />
          </p>
          <p className="ant-upload-text">Tarik file CSV/Excel ke sini atau klik untuk memilih file</p>
          <p className="ant-upload-hint">Format yang diterima: .csv, .xlsx, .xls</p>
        </Dragger>

        {uploading ? <Progress percent={progress} status={progress >= 100 ? "success" : "active"} /> : null}

        {error ? <Alert message={error} showIcon type="error" /> : null}

        {result ? (
          <Alert
            message={result.message}
            showIcon
            type={result.errorCount > 0 ? "warning" : "success"}
            description={
              <div className={styles.uploadResult}>
                <Descriptions column={3} size="small">
                  <Descriptions.Item label="Imported">{result.importedCount}</Descriptions.Item>
                  <Descriptions.Item label="Error">{result.errorCount}</Descriptions.Item>
                  <Descriptions.Item label="Alert">{result.alertCount}</Descriptions.Item>
                </Descriptions>

                {result.errors.length > 0 ? (
                  <List
                    dataSource={result.errors}
                    header={<Text strong>Daftar error</Text>}
                    renderItem={(item) => (
                      <List.Item>
                        <FileSpreadsheet aria-hidden="true" size={15} />
                        <span>{item}</span>
                      </List.Item>
                    )}
                    size="small"
                  />
                ) : null}
              </div>
            }
          />
        ) : null}
      </div>
    </Modal>
  );
}
