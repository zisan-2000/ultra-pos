import { isSmtpConfigured, sendSmtpMail } from "@/lib/email/smtp-client";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Micro POS";

type PasswordResetEmailInput = {
  toEmail: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export function canSendPasswordResetEmail() {
  return isSmtpConfigured();
}

export async function sendPasswordResetEmail({
  toEmail,
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailInput) {
  const subject = `${APP_NAME}: Password reset link`;
  const text = [
    `Hello,`,
    ``,
    `We received a request to reset your ${APP_NAME} password.`,
    `Use the link below to set a new password:`,
    resetUrl,
    ``,
    `This link will expire in ${expiresInMinutes} minutes and can be used only once.`,
    ``,
    `If you did not request this reset, you can ignore this email.`,
    ``,
    `- ${APP_NAME} Team`,
  ].join("\n");

  await sendSmtpMail({
    to: toEmail,
    subject,
    text,
  });
}
