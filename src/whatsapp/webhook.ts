import type { MensagemRecebida } from "./tipos";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). */
export async function verificarAssinatura(corpo: ArrayBuffer, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = hex(new Uint8Array(await crypto.subtle.sign("HMAC", chave, corpo)));
  return iguaisTempoConstante(assinatura, cabecalho.slice("sha256=".length).toLowerCase());
}

interface MensagemBruta {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown };
  audio?: { id?: unknown };
  context?: { forwarded?: unknown; frequently_forwarded?: unknown };
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function converter(bruta: MensagemBruta): MensagemRecebida | null {
  if (typeof bruta.id !== "string" || typeof bruta.from !== "string") return null;
  const base = {
    id: bruta.id,
    de: bruta.from,
    encaminhada: bruta.context?.forwarded === true || bruta.context?.frequently_forwarded === true,
  };
  if (bruta.type === "text" && typeof bruta.text?.body === "string") {
    return { id: base.id, de: base.de, tipo: "texto", texto: bruta.text.body, encaminhada: base.encaminhada };
  }
  if (bruta.type === "audio" && typeof bruta.audio?.id === "string") {
    return { id: base.id, de: base.de, tipo: "audio", audioId: bruta.audio.id, encaminhada: base.encaminhada };
  }
  return { id: base.id, de: base.de, tipo: "outro", encaminhada: base.encaminhada };
}

export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const mensagens: MensagemRecebida[] = [];
  if (typeof payload !== "object" || payload === null) return mensagens;
  for (const entrada of lista((payload as { entry?: unknown }).entry)) {
    for (const mudanca of lista((entrada as { changes?: unknown })?.changes)) {
      const valor = (mudanca as { value?: { messages?: unknown } })?.value;
      for (const bruta of lista(valor?.messages)) {
        const m = typeof bruta === "object" && bruta !== null ? converter(bruta as MensagemBruta) : null;
        if (m) mensagens.push(m);
      }
    }
  }
  return mensagens;
}

/** Celular brasileiro: 55 + DDD + 9 + 8 dígitos. O WhatsApp às vezes entrega sem o 9. */
function canonico(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") return d.slice(0, 4) + d.slice(5);
  return d;
}

export function mesmoNumero(a: string, b: string): boolean {
  const ca = canonico(a);
  return ca.length > 0 && ca === canonico(b);
}
