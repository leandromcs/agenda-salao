export const LIMITE_TEXTO = 4096;

export function dividirTexto(texto: string, limite = LIMITE_TEXTO): string[] {
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > limite) {
    let corte = resto.lastIndexOf("\n", limite);
    if (corte <= 0) corte = limite;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^\n/, "");
  }
  if (resto.length > 0) partes.push(resto);
  return partes;
}

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  versao: string;
}

export type Buscar = (entrada: string, init?: RequestInit) => Promise<Response>;

// Nos Workers, chamar `fetch` como método de outro objeto dá "Illegal invocation"; por isso o embrulho.
const fetchPadrao: Buscar = (entrada, init) => fetch(entrada, init);

export class WhatsAppCliente {
  constructor(
    private readonly cfg: ConfigWhatsApp,
    private readonly buscar: Buscar = fetchPadrao,
  ) {}

  private get base(): string {
    return `https://graph.facebook.com/${this.cfg.versao}`;
  }

  private get autorizacao(): Record<string, string> {
    return { Authorization: `Bearer ${this.cfg.token}` };
  }

  private async postar(corpo: unknown): Promise<void> {
    const r = await this.buscar(`${this.base}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { ...this.autorizacao, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(`WhatsApp respondeu ${r.status}: ${await r.text()}`);
  }

  async enviarTexto(para: string, texto: string): Promise<void> {
    for (const parte of dividirTexto(texto)) {
      await this.postar({ messaging_product: "whatsapp", to: para, type: "text", text: { body: parte } });
    }
  }

  async enviarModelo(para: string, nome: string, parametros: string[]): Promise<void> {
    await this.postar({
      messaging_product: "whatsapp",
      to: para,
      type: "template",
      template: {
        name: nome,
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) }],
      },
    });
  }

  async baixarMidia(mediaId: string): Promise<ArrayBuffer> {
    const meta = await this.buscar(`${this.base}/${mediaId}`, { headers: this.autorizacao });
    if (!meta.ok) throw new Error(`Falha ao obter a mídia ${mediaId}: ${meta.status}`);
    const { url } = (await meta.json()) as { url?: string };
    if (!url) throw new Error(`Mídia ${mediaId} sem URL`);
    const arquivo = await this.buscar(url, { headers: this.autorizacao });
    if (!arquivo.ok) throw new Error(`Falha ao baixar a mídia ${mediaId}: ${arquivo.status}`);
    return await arquivo.arrayBuffer();
  }
}
