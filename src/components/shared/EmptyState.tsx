"use client";

import { Button } from "antd";
import { Database, type LucideIcon } from "lucide-react";
import styles from "./empty-state.module.css";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  icon?: LucideIcon;
  className?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, icon: Icon = Database, className, onAction }: EmptyStateProps) {
  return (
    <div className={`${styles.emptyState}${className ? ` ${className}` : ""}`} role="status">
      <span className={styles.iconWrap}>
        <Icon aria-hidden="true" size={48} strokeWidth={1.6} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel && onAction ? (
        <Button className={styles.action} size="small" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
