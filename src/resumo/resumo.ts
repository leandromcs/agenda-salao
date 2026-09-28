import type { RepositorioAgenda } from "../agenda/repositorio";
import type { Agendamento } from "../agenda/tipos";
import type { Historico } from "../conversa/historico";
import { dataCurta, hojeEm, horaDe, paraIso, somarDias } from "../tempo";
import type { WhatsAppCliente } from "../whatsapp/cliente";

const LIMITE_PARAMETRO = 900;
export const JANELA_SEGURA_MS = 23 * 60 * 60 * 1000;

/** Parâmetros de modelo da Meta não aceitam quebra de linha, tab nem 4+ espaços seguidos. */
function paraParametro(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

export function linhaItem(a: Agendamento): string {
  const base = `${horaDe(a.inicio)}–${horaDe(a.fim)} ${a.cliente}`;
  if (a.tipo === "bloqueio") return `${base} (bloqueio)`;
  return a.servico ? `${base} — ${a.servico}` : base;
}

function linhaUnica(itens: string[]): string {
  const partes: string[] = [];
  let tamanho = 0;
  for (let i = 0; i < itens.length; i++) {
    const item = paraParametro(itens[i]!);
    const restantes = itens.length - i - 1;
    const sufixo = restantes > 0 ? ` • … e mais ${restantes}` : "";
    const acrescimo = (partes.length > 0 ? 3 : 0) + item.length;
    if (tamanho + acrescimo + sufixo.length > LIMITE_PARAMETRO) {
      const resto = `… e mais ${itens.length - i}`;
      return partes.length > 0 ? `${partes.join(" • ")} • ${resto}` : resto;
    }
    partes.push(item);
    tamanho += acrescimo;
  }
  return partes.join(" • ");
}

export function montarResumo(data: string, itens: Agendamento[]): { texto: string; parametros: [string, string] } {
  const dia = dataCurta(data);
  if (itens.length === 0) {
    return { texto: `📒 Amanhã, ${dia}: você não tem atendimentos.`, parametros: [dia, "nenhum atendimento"] };
  }
  const linhas = itens.map(linhaItem);
  return {
    texto: `📒 Amanhã, ${dia}\n\n${linhas.join("\n")}`,
    parametros: [dia, linhaUnica(linhas)],
  };
}

export interface DepsResumo {
  repo: Pick<RepositorioAgenda, "listarEntre">;
  whatsapp: Pick<WhatsAppCliente, "enviarTexto" | "enviarModelo">;
  historico: Pick<Historico, "ultimaDelaEm">;
  numeroDela: string;
  numeroAdmin: string;
  modeloResumo: string;
  modeloAlerta: string;
  relogio: () => Date;
  esperar: (ms: number) => Promise<void>;
}

const ESPERAS_MS = [0, 5_000, 30_000];

export async function enviarResumoNoturno(deps: DepsResumo): Promise<"enviado" | "falhou"> {
  const agora = deps.relogio();
  const amanha = somarDias(hojeEm(agora), 1);
  let ultimoErro: unknown;

  for (const espera of ESPERAS_MS) {
    if (espera > 0) await deps.esperar(espera);
    try {
      const itens = await deps.repo.listarEntre(paraIso(amanha, "00:00"), paraIso(somarDias(amanha, 1), "00:00"));
      const { texto, parametros } = montarResumo(amanha, itens);
      const ultima = await deps.historico.ultimaDelaEm();
      if (ultima && agora.getTime() - ultima.getTime() < JANELA_SEGURA_MS) {
        await deps.whatsapp.enviarTexto(deps.numeroDela, texto);
      } else {
        await deps.whatsapp.enviarModelo(deps.numeroDela, deps.modeloResumo, parametros);
      }
      return "enviado";
    } catch (erro) {
      ultimoErro = erro;
      console.error("Falha ao enviar o resumo noturno", erro);
    }
  }

  try {
    const detalhe = paraParametro(String(ultimoErro)).slice(0, 200);
    await deps.whatsapp.enviarModelo(deps.numeroAdmin, deps.modeloAlerta, [
      `Falha ao enviar o resumo de ${dataCurta(amanha)}: ${detalhe}`,
    ]);
  } catch (erro) {
    console.error("Falha também ao alertar o administrador", erro);
  }
  return "falhou";
}
