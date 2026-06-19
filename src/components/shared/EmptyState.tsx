"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import type { ButtonProps } from "antd";
import { Database, type LucideIcon } from "lucide-react";
import styles from "./empty-state.module.css";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: ButtonProps["type"];
  icon?: LucideIcon;
  illustration?: ReactNode;
  className?: string;
  variant?: "default" | "neutral" | "success";
  onAction?: () => void;
};

const variantClass = {
  default: "",
  neutral: styles.neutral,
  success: styles.success,
};

export function EmptyState({
  title,
  description,
  actionLabel,
  actionType,
  icon: Icon = Database,
  illustration,
  className,
  variant = "default",
  onAction,
}: EmptyStateProps) {
  return (
    <div
      className={`${styles.emptyState}${variantClass[variant] ? ` ${variantClass[variant]}` : ""}${className ? ` ${className}` : ""}`}
      role="status"
    >
      {illustration ?? (
        <span className={styles.iconWrap}>
          <Icon aria-hidden="true" size={48} strokeWidth={1.6} />
        </span>
      )}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel && onAction ? (
        <Button
          className={`${styles.action}${actionType === "primary" ? ` ${styles.primaryAction}` : ""}`}
          size="small"
          type={actionType}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
