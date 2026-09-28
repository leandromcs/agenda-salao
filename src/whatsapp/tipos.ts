/** Mensagem do WhatsApp já extraída do payload do webhook. */
export interface MensagemRecebida {
  /** id da mensagem no WhatsApp (wamid...). */
  id: string;
  /** Número de quem enviou, como vem no campo `from` do webhook. */
  de: string;
  tipo: "texto" | "audio" | "outro";
  texto?: string;
  audioId?: string;
  encaminhada: boolean;
}
