import type Anthropic from "@anthropic-ai/sdk";
import type { OperacoesAgenda } from "../agenda/servico";
import type { Turno } from "../conversa/historico";
import { executarFerramenta, FERRAMENTAS, FERRAMENTAS_QUE_ALTERAM } from "./ferramentas";

export interface ClienteClaude {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface OpcoesResposta {
  cliente: ClienteClaude;
  modelo: string;
  sistema: string;
  historico: Turno[];
  entrada: string;
  agenda: OperacoesAgenda;
  maxIteracoes?: number;
  /** Chamado logo depois de cada alteração na agenda (ou tentativa de alteração que falhou). */
  aoAlterar?: () => Promise<void>;
}

export interface Resposta {
  texto: string;
  houveAlteracao: boolean;
  chamadas: { nome: string; entrada: unknown }[];
}

export class ErroAssistente extends Error {
  constructor(
    message: string,
    readonly houveAlteracao: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ErroAssistente";
  }
}

export const RESPOSTA_SEM_TEXTO = "Desculpe, me perdi aqui. Pode repetir de outro jeito?";

function deuCerto(resultado: unknown): boolean {
  return typeof resultado === "object" && resultado !== null && (resultado as { ok?: unknown }).ok === true;
}

export async function responder(o: OpcoesResposta): Promise<Resposta> {
  const mensagens: Anthropic.MessageParam[] = [
    ...o.historico.map((t): Anthropic.MessageParam => ({ role: t.papel, content: t.conteudo })),
    { role: "user", content: o.entrada },
  ];
  const chamadas: Resposta["chamadas"] = [];
  let houveAlteracao = false;

  try {
    for (let i = 0; i < (o.maxIteracoes ?? 8); i++) {
      const r = await o.cliente.messages.create({
        model: o.modelo,
        max_tokens: 2048,
        system: o.sistema,
        tools: FERRAMENTAS,
        messages: mensagens,
      });

      if (r.stop_reason !== "tool_use") {
        const texto = r.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { texto: texto || RESPOSTA_SEM_TEXTO, houveAlteracao, chamadas };
      }

      mensagens.push({ role: "assistant", content: r.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of r.content) {
        if (bloco.type !== "tool_use") continue;
        chamadas.push({ nome: bloco.name, entrada: bloco.input });
        const altera = FERRAMENTAS_QUE_ALTERAM.has(bloco.name);
        try {
          const resultado = await executarFerramenta(o.agenda, bloco.name, bloco.input);
          if (altera && deuCerto(resultado)) {
            houveAlteracao = true;
            await o.aoAlterar?.();
          }
          resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(resultado) });
        } catch (erro) {
          console.error(`Falha na ferramenta ${bloco.name}`, erro);
          // Por segurança, uma ferramenta que altera e falhou conta como possível alteração.
          if (altera) {
            houveAlteracao = true;
            await o.aoAlterar?.();
          }
          resultados.push({
            type: "tool_result",
            tool_use_id: bloco.id,
            content: `Erro interno ao executar ${bloco.name}.`,
            is_error: true,
          });
        }
      }
      mensagens.push({ role: "user", content: resultados });
    }
    return { texto: RESPOSTA_SEM_TEXTO, houveAlteracao, chamadas };
  } catch (erro) {
    throw new ErroAssistente("Falha ao conversar com o Claude", houveAlteracao, { cause: erro });
  }
}
