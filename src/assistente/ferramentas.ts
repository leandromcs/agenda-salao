import type Anthropic from "@anthropic-ai/sdk";
import type {
  EntradaConsultar,
  EntradaDesmarcar,
  EntradaLivres,
  EntradaMarcar,
  EntradaRemarcar,
  OperacoesAgenda,
} from "../agenda/servico";

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD." } as const;
const HORA = { type: "string", description: "Hora no formato HH:MM (24h)." } as const;

export const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: "consultar_agenda",
    description:
      "Lista os atendimentos e bloqueios marcados entre duas datas (inclusive), em ordem. Use para responder perguntas sobre a agenda e para achar o id de um agendamento antes de remarcar ou desmarcar.",
    input_schema: {
      type: "object",
      properties: {
        data_inicio: DATA,
        data_fim: { ...DATA, description: "Data final (inclusive), AAAA-MM-DD. Máximo 62 dias depois do início." },
        nome: { type: "string", description: "Filtro opcional por parte do nome da cliente (ignora acentos)." },
      },
      required: ["data_inicio", "data_fim"],
    },
  },
  {
    name: "horarios_livres",
    description:
      "Lista os intervalos livres de um dia que comportam a duração pedida, dentro do horário padrão. Use para sugerir horários.",
    input_schema: {
      type: "object",
      properties: {
        data: DATA,
        duracao_min: { type: "integer", description: "Duração do atendimento em minutos." },
        faixa_inicio: { ...HORA, description: "Opcional: início da faixa desejada (ex.: 12:00 para 'à tarde')." },
        faixa_fim: { ...HORA, description: "Opcional: fim da faixa desejada (ex.: 12:00 para 'de manhã')." },
      },
      required: ["data", "duracao_min"],
    },
  },
  {
    name: "marcar",
    description:
      "Marca um atendimento ou um bloqueio (folga, médico, compromisso). Se houver sobreposição, NÃO marca e devolve os conflitos; só chame de novo com confirmado_sobreposicao=true depois que a dona disser que sim.",
    input_schema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nome da cliente, ou descrição do bloqueio." },
        data: DATA,
        hora: HORA,
        duracao_min: { type: "integer", description: "Duração em minutos (informada pela dona)." },
        servico: { type: "string", description: "Opcional: serviço (ex.: escova)." },
        observacao: { type: "string", description: "Opcional: observação livre." },
        tipo: { type: "string", enum: ["atendimento", "bloqueio"], description: "Padrão: atendimento." },
        confirmado_sobreposicao: { type: "boolean", description: "true só depois que a dona confirmar a sobreposição." },
      },
      required: ["cliente", "data", "hora", "duracao_min"],
    },
  },
  {
    name: "remarcar",
    description:
      "Muda data/hora (e opcionalmente a duração) de um agendamento existente. Só use depois que a dona disser 'sim' à mudança descrita.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "id do agendamento (obtido em consultar_agenda)." },
        data: DATA,
        hora: HORA,
        duracao_min: { type: "integer", description: "Opcional: nova duração. Se omitida, mantém a atual." },
        confirmado_sobreposicao: { type: "boolean", description: "true só depois que a dona confirmar a sobreposição." },
      },
      required: ["id", "data", "hora"],
    },
  },
  {
    name: "desmarcar",
    description: "Cancela um agendamento existente. Só use depois que a dona disser 'sim' ao cancelamento descrito.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer", description: "id do agendamento (obtido em consultar_agenda)." } },
      required: ["id"],
    },
  },
  {
    name: "desfazer",
    description: "Desfaz a última alteração (marcação, remarcação ou cancelamento) ainda não desfeita.",
    input_schema: { type: "object", properties: {} },
  },
];

export const FERRAMENTAS_QUE_ALTERAM: ReadonlySet<string> = new Set(["marcar", "remarcar", "desmarcar", "desfazer"]);

export async function executarFerramenta(agenda: OperacoesAgenda, nome: string, entrada: unknown): Promise<unknown> {
  const e = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
  switch (nome) {
    case "consultar_agenda":
      return await agenda.consultar(e as unknown as EntradaConsultar);
    case "horarios_livres":
      return await agenda.livres(e as unknown as EntradaLivres);
    case "marcar":
      return await agenda.marcar(e as unknown as EntradaMarcar);
    case "remarcar":
      return await agenda.remarcar(e as unknown as EntradaRemarcar);
    case "desmarcar":
      return await agenda.desmarcar(e as unknown as EntradaDesmarcar);
    case "desfazer":
      return await agenda.desfazer();
    default:
      return { ok: false, erro: `Ferramenta desconhecida: ${nome}` };
  }
}
