"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { Landmark, LockKeyhole, UserRound, Zap } from "lucide-react";
import { loginWithPassword } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import styles from "./page.module.css";

const { Text, Title } = Typography;

type LoginFormValues = {
  username: string;
  password: string;
};

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  if (value.startsWith("/login")) {
    return "/";
  }
  return value;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => normalizeNextPath(searchParams.get("next")), [searchParams]);
  const { isLoading: authLoading } = useAuth({ redirectIfFound: nextPath });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (values: LoginFormValues) => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await loginWithPassword({
        username: values.username.trim(),
        password: values.password,
        next: nextPath,
      });
      router.replace(nextPath);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Username atau password salah.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginPanel} aria-label="Login Aplikasi Monitoring Susut Energi">
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>
            <Landmark aria-hidden="true" size={28} strokeWidth={2.2} />
          </div>
          <div>
            <Text className={styles.brandEyebrow}>Internal PLN</Text>
            <Title className={styles.brandTitle} level={1}>
              Aplikasi Monitoring Susut Energi
            </Title>
          </div>
        </div>

        <Card className={styles.loginCard} variant="borderless">
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>
              <Zap aria-hidden="true" size={20} />
            </span>
            <div>
              <Title className={styles.formTitle} level={2}>
                Masuk
              </Title>
              <Text type="secondary">Gunakan akun operasional untuk mengakses dashboard kWh.</Text>
            </div>
          </div>

          {errorMessage ? (
            <Alert
              className={styles.loginAlert}
              message={errorMessage}
              showIcon
              type="error"
            />
          ) : null}

          <Form<LoginFormValues>
            layout="vertical"
            requiredMark={false}
            size="large"
            onFinish={handleSubmit}
          >
            <Form.Item
              label="Username"
              name="username"
              rules={[{ message: "Username wajib diisi.", required: true }]}
            >
              <Input
                autoComplete="username"
                autoFocus
                disabled={submitting || authLoading}
                prefix={<UserRound aria-hidden="true" size={18} />}
                placeholder="Masukkan username"
              />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ message: "Password wajib diisi.", required: true }]}
            >
              <Input.Password
                autoComplete="current-password"
                disabled={submitting || authLoading}
                prefix={<LockKeyhole aria-hidden="true" size={18} />}
                placeholder="Masukkan password"
              />
            </Form.Item>

            <Button
              block
              className={styles.submitButton}
              htmlType="submit"
              loading={submitting || authLoading}
              type="primary"
            >
              Masuk
            </Button>
          </Form>

          <Text className={styles.cardFooter}>
            Akses dibatasi untuk admin, operator, viewer, dan auditor internal.
          </Text>
        </Card>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className={styles.loginShell} />}>
      <LoginPageContent />
    </Suspense>
  );
}
