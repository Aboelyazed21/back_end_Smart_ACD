import nodemailer, { Transporter } from 'nodemailer';
import { env, isTest } from '../config/env';
import { logger } from '../config/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (isTest) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      ignoreTLS: env.NODE_ENV !== 'production',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASSWORD
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
    });
  }
  return transporter;
}

async function send(to: string, subject: string, text: string): Promise<void> {
  try {
    await getTransporter().sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (error) {
    // Mail failure must not leak whether an account exists, and must not break
    // the request. Log without the recipient address.
    logger.error({ err: error, subject }, 'email delivery failed');
  }
}

export const mailer = {
  sendPasswordReset: (to: string, token: string) =>
    send(
      to,
      'Smart Academic Advisor - password reset',
      `Use the following link within ${env.RESET_TOKEN_TTL_MINUTES} minutes:\n` +
        `${env.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}\n` +
        'If you did not request this, ignore this message.',
    ),
  sendEscalation: (to: string, ticketNo: string) =>
    send(
      to,
      `Academic advising escalation ${ticketNo}`,
      `A new advising case (${ticketNo}) needs review. Open the advisor workspace to continue.`,
    ),
  sendWelcome: (to: string, temporaryPassword: string) =>
    send(
      to,
      'Smart Academic Advisor - account created',
      `Your account was created. Sign in and change the temporary password immediately.\n` +
        `Temporary password: ${temporaryPassword}`,
    ),
  _setTransport: (value: Transporter | null) => {
    transporter = value;
  },
};
