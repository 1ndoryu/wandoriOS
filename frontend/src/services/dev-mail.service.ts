/* wandori.us — Dev Mailbox Service
 * [297A-13] En desarrollo (sin RESEND_API_KEY) los correos transaccionales se
 * mockean en un buzón en memoria servido por GET /api/dev/mail. Este servicio
 * lo consume la UI de Cuenta para ofrecer "verificar ahora" sin proveedor.
 * En producción el endpoint devuelve 404 (fail-closed) y el flujo normal es
 * el enlace por correo real. */

import { ApiError, unwrapGeneratedResponse } from '../api/client';
import { listDevMail } from '../api/generated/dev-mail/dev-mail';

export interface DevMailMessage {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly link: string;
  readonly created_at: string;
}

export const DevMailService = {
  /** Último enlace de verificación para un correo, solo si el buzón dev existe. */
  async latestVerificationLink(email: string): Promise<string | null> {
    try {
      const response = await listDevMail();
      const messages = unwrapGeneratedResponse<DevMailMessage[]>(response, [200]);
      const match = [...messages].reverse().find((message) => message.to === email);
      return match?.link ?? null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      return null;
    }
  },
};
