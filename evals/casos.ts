import type { NovoAgendamento } from "../src/agenda/repositorio";
import type Anthropic from "@anthropic-ai/sdk";
import { PREFIXO_ENCAMINHADA } from "../src/conversa/normalizador";

export interface Chamada {
  nome: string;
  entrada: Record<string, unknown>;
}

export interface Caso {
  nome: string;
  agenda?: NovoAgendamento[];
  historico?: Anthropic.MessageParam[];
  entrada: string;
  /** Devolve null se passou, ou a descrição da falha. */
  verificar(chamadas: Chamada[], texto: string): string | null;
}

const iso = (data: string, hora: string) => `${data}T${hora}:00-03:00`;
const at = (cliente: string, data: string, inicio: string, fim: string): NovoAgendamento => ({
  cliente,
  inicio: iso(data, inicio),
  fim: iso(data, fim),
  servico: null,
  observacao: null,
  tipo: "atendimento",
});

const de = (chamadas: Chamada[], nome: string) => chamadas.filter((c) => c.nome === nome);
const ALTERAM = ["marcar", "remarcar", "desmarcar", "desfazer"];
const alteracoes = (chamadas: Chamada[]) => chamadas.filter((c) => ALTERAM.includes(c.nome));

export const CASOS: Caso[] = [
  {
    nome: "marcar com dados completos",
    entrada: "marca a Maria sexta às 14h, escova, 1 hora",
    verificar: (c) => {
      const m = de(c, "marcar")[0]?.entrada;
      if (!m) return "não chamou marcar";
      if (m.data !== "2026-10-02" || m.hora !== "14:00" || m.duracao_min !== 60) return `marcar com ${JSON.stringify(m)}`;
      return String(m.cliente).includes("Maria") ? null : "nome errado";
    },
  },
  {
    nome: "marcar sem duração pergunta",
    entrada: "marca a Joana amanhã às 10h",
    verificar: (c, t) => (alteracoes(c).length === 0 && t.includes("?") ? null : "marcou ou não perguntou a duração"),
  },
  {
    nome: "quinta vira a data certa",
    entrada: "Carla quinta às 9h, unha, 45 minutos",
    verificar: (c) => {
      const m = de(c, "marcar")[0]?.entrada;
      return m?.data === "2026-10-01" && m.hora === "09:00" && m.duracao_min === 45 ? null : `marcar com ${JSON.stringify(m)}`;
    },
  },
  {
    nome: "sobreposição avisa e não confirma sozinho",
    agenda: [at("Ana", "2026-10-02", "14:30", "15:30")],
    entrada: "marca a Bia sexta às 14h, escova, 1 hora",
    verificar: (c, t) => {
      if (de(c, "marcar").some((x) => x.entrada.confirmado_sobreposicao === true)) return "confirmou sobreposição sozinho";
      return t.includes("Ana") ? null : "não mencionou a Ana";
    },
  },
  {
    nome: "desmarcar com nome ambíguo pergunta qual",
    agenda: [at("Maria Silva", "2026-09-30", "10:00", "11:00"), at("Maria Souza", "2026-10-01", "15:00", "16:00")],
    entrada: "desmarca a Maria",
    verificar: (c, t) => (de(c, "desmarcar").length === 0 && t.includes("?") ? null : "desmarcou sem perguntar qual"),
  },
  {
    nome: "remarcar pede confirmação",
    agenda: [at("Ana", "2026-10-02", "14:30", "15:30")],
    entrada: "passa a Ana de sexta para as 16h",
    verificar: (c, t) => (de(c, "remarcar").length === 0 && t.includes("?") ? null : "remarcou sem pedir sim"),
  },
  {
    nome: "remarcar depois do sim",
    agenda: [at("Ana", "2026-10-02", "14:30", "15:30")],
    historico: [
      { role: "user", content: "passa a Ana de sexta para as 16h" },
      { role: "assistant", content: "Vou mudar a Ana de sex 02/10 14:30–15:30 para 16:00–17:00. Confirma?" },
    ],
    entrada: "sim",
    verificar: (c) => {
      const r = de(c, "remarcar")[0]?.entrada;
      return r?.hora === "16:00" && r.data === "2026-10-02" ? null : `remarcar com ${JSON.stringify(r)}`;
    },
  },
  {
    nome: "desfazer",
    agenda: [at("Ana", "2026-10-02", "14:30", "15:30")],
    historico: [
      { role: "user", content: "marca a Ana sexta 14:30, 1h" },
      { role: "assistant", content: "✅ Marquei Ana, sex 02/10, 14:30–15:30." },
    ],
    entrada: "desfaz",
    verificar: (c) => (de(c, "desfazer").length === 1 ? null : "não chamou desfazer"),
  },
  {
    nome: "encaminhada sem nome não marca",
    entrada: `${PREFIXO_ENCAMINHADA}\nOi! Tem horário sexta à tarde pra escova?`,
    verificar: (c, t) => {
      if (alteracoes(c).length > 0) return "marcou antes de a dona escolher";
      return t.includes("?") || /nome/i.test(t) ? null : "não pediu o nome da cliente";
    },
  },
  {
    nome: "bloqueio do dia todo",
    entrada: "bloqueia segunda que vem o dia todo, vou ao médico",
    verificar: (c) => {
      const m = de(c, "marcar")[0]?.entrada;
      if (!m) return "não marcou bloqueio";
      return m.tipo === "bloqueio" && m.data === "2026-10-05" && m.hora === "08:00" && m.duracao_min === 720
        ? null
        : `marcar com ${JSON.stringify(m)}`;
    },
  },
  {
    nome: "consulta horários livres",
    entrada: "tenho algo livre amanhã de manhã pra uma escova de 1h?",
    verificar: (c) => {
      const l = de(c, "horarios_livres")[0]?.entrada;
      return l?.data === "2026-09-29" && l.duracao_min === 60 ? null : `horarios_livres com ${JSON.stringify(l)}`;
    },
  },
  {
    nome: "fora de escopo não mexe na agenda",
    entrada: "qual a capital da França?",
    verificar: (c) => (alteracoes(c).length === 0 ? null : "alterou a agenda"),
  },
  {
    // Reprodução da conversa real do piloto (2026-09-28): depois de uma marcação de verdade,
    // o assistente passou a responder "✅ Marquei…" sem chamar a ferramenta.
    nome: "reprodução piloto: marcar depois de conflito recusado",
    agenda: [at("Joana", "2026-09-29", "10:00", "11:00")],
    historico: [
      { role: "user", content: "Quem eu tenho para atender amanhã?" },
      { role: "assistant", content: "Amanhã (terça 29/09) você não tem ninguém agendado ainda. Tá livre! 😊" },
      { role: "user", content: "Marca a Joana amanhã às 10h" },
      { role: "assistant", content: "Preciso de mais uma info: quanto tempo vai levar o atendimento da Joana? (em minutos)" },
      { role: "user", content: "1h" },
      { role: "assistant", content: "✅ Marquei Joana, ter 29/09, 10:00–11:00." },
      { role: "user", content: "Carla amanhã 10h30 unha 45 min" },
      { role: "assistant", content: "Não dá, tem conflito com a Joana (ter 29/09, 10:00–11:00). Quer marcar mesmo assim?" },
    ],
    entrada: "Não. Marque para às 11h então",
    verificar: (c) => verificarCarla11h(c),
  },
  {
    // A mesma conversa, com o histórico no formato novo: chamadas de ferramenta e resultados incluídos.
    nome: "reprodução piloto com ferramentas no histórico",
    agenda: [at("Joana", "2026-09-29", "10:00", "11:00")],
    historico: [
      { role: "user", content: "Quem eu tenho para atender amanhã?" },
      { role: "assistant", content: [{ type: "tool_use", id: "h1", name: "consultar_agenda", input: { data_inicio: "2026-09-29", data_fim: "2026-09-29" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "h1", content: '{"ok":true,"agendamentos":[]}' }] },
      { role: "assistant", content: "Amanhã (terça 29/09) você não tem ninguém agendado ainda. Tá livre! 😊" },
      { role: "user", content: "Marca a Joana amanhã às 10h" },
      { role: "assistant", content: "Preciso de mais uma info: quanto tempo vai levar o atendimento da Joana? (em minutos)" },
      { role: "user", content: "1h" },
      { role: "assistant", content: [{ type: "tool_use", id: "h2", name: "marcar", input: { cliente: "Joana", data: "2026-09-29", hora: "10:00", duracao_min: 60 } }] },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "h2",
            content: '{"ok":true,"agendamento":{"id":1,"cliente":"Joana","data":"2026-09-29","dia":"ter 29/09","inicio":"10:00","fim":"11:00","servico":null,"tipo":"atendimento"}}',
          },
        ],
      },
      { role: "assistant", content: "✅ Marquei Joana, ter 29/09, 10:00–11:00." },
      { role: "user", content: "Carla amanhã 10h30 unha 45 min" },
      { role: "assistant", content: [{ type: "tool_use", id: "h3", name: "marcar", input: { cliente: "Carla", data: "2026-09-29", hora: "10:30", duracao_min: 45, servico: "unha" } }] },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "h3",
            content: '{"ok":false,"erro":"Sobreposição: NÃO marquei. Pergunte se deve marcar mesmo assim.","conflitos":[{"id":1,"cliente":"Joana","data":"2026-09-29","dia":"ter 29/09","inicio":"10:00","fim":"11:00","servico":null,"tipo":"atendimento"}]}',
          },
        ],
      },
      { role: "assistant", content: "Não dá, tem conflito com a Joana (ter 29/09, 10:00–11:00). Quer marcar mesmo assim?" },
    ],
    entrada: "Não. Marque para às 11h então",
    verificar: (c) => verificarCarla11h(c),
  },
];

CASOS.push(
  {
    nome: "serviço ausente: pergunta se quer adicionar",
    entrada: "marca a Joana amanhã às 10h, 1 hora",
    // A ferramenta recusa marcar sem o campo servico; uma tentativa recusada não marca nada.
    // O que importa: a resposta pergunta do serviço e não confirma marcação.
    verificar: (c, t) => {
      if (de(c, "marcar").some((x) => typeof x.entrada.servico === "string")) return "marcou sem perguntar do serviço";
      if (t.includes("✅")) return "confirmou marcação sem saber do serviço";
      return /servi[çc]o/i.test(t) ? null : "não perguntou do serviço";
    },
  },
  {
    nome: "editar serviço usa atualizar",
    agenda: [
      { cliente: "Maria", inicio: iso("2026-09-29", "22:00"), fim: iso("2026-09-30", "00:00"), servico: null, observacao: null, tipo: "atendimento" },
    ],
    entrada: "coloca unha como serviço da Maria de amanhã às 22h",
    verificar: (c) => {
      if (de(c, "desmarcar").length || de(c, "marcar").length) return "desmarcou/marcou em vez de editar";
      const a = de(c, "atualizar")[0]?.entrada;
      return a && /unha/i.test(String(a.servico)) ? null : `atualizar com ${JSON.stringify(a)}`;
    },
  },
  {
    nome: "fora do horário padrão: marca e avisa",
    entrada: "marca a Maria amanhã às 22h, 2 horas, sem serviço",
    // Aceita as duas formas de "avisar e permitir": marcar com aviso, ou perguntar antes citando o horário.
    verificar: (c, t) => {
      const m = de(c, "marcar")[0]?.entrada;
      const avisou = /⚠️|fora do hor|hor[áa]rio padr[ãa]o|20h|20:00/i.test(t);
      if (m?.hora === "22:00") return avisou ? null : "marcou sem avisar que está fora do horário padrão";
      if (alteracoes(c).length === 0 && avisou && t.includes("?")) return null;
      return `nem marcou às 22:00 nem perguntou citando o horário (marcar: ${JSON.stringify(m)})`;
    },
  },
);

CASOS.push({
  // Rodada 1 do piloto: depois de confirmar um áudio confuso, perguntou "Certo?" de novo.
  nome: "áudio confuso: um sim basta para remarcar",
  agenda: [{ ...at("Bia", "2026-09-29", "09:00", "10:00"), servico: "Escova" }],
  historico: [
    { role: "user", content: "[Áudio transcrito] Passa a beia para as duas da tarde." },
    { role: "assistant", content: "A transcrição ficou confusa. Você quer remarcar a Bia de amanhã (09:00) para as 14h (duas da tarde)? É isso?" },
  ],
  entrada: "Sim",
  verificar: (c) => {
    const r = de(c, "remarcar")[0]?.entrada;
    return r?.hora === "14:00" ? null : "pediu confirmação de novo em vez de remarcar";
  },
});

export interface Roteiro {
  nome: string;
  agenda?: NovoAgendamento[];
  /** Mensagens dela, em ordem; o histórico vai sendo montado com os turnos reais. */
  passos: string[];
  /** Confere a agenda no fim (só os marcados). Devolve null se passou. */
  verificar(marcados: { cliente: string; inicio: string; fim: string; servico: string | null }[]): string | null;
}

export const ROTEIROS: Roteiro[] = [
  {
    // A conversa real do piloto de 2026-09-28, em que só a primeira marcação chegou ao banco.
    nome: "roteiro do piloto",
    passos: [
      "Marca a Joana amanhã às 10h, 1 hora, sem serviço",
      "Carla amanhã 10h30 unha 45 min",
      "Não. Marque para às 11h então",
      "[Áudio transcrito] Passa a Carla para amanhã às 14 horas.",
      "Sim",
      "Marque a Maria amanhã às 22h, 2 horas, sem serviço",
      "Coloca unha como serviço da Maria das 22h",
      "Cancele o atendimento da Joana",
      "Sim",
    ],
    verificar: (marcados) => {
      const resumo = marcados.map((a) => `${a.cliente} ${a.inicio.slice(11, 16)}-${a.fim.slice(11, 16)} ${a.servico ?? "-"}`).sort();
      const esperado = ["Carla 14:00-14:45 unha", "Maria 22:00-00:00 unha"];
      const ok =
        resumo.length === 2 &&
        /^Carla 14:00-14:45 unha/i.test(resumo[0]!) &&
        /^Maria 22:00-00:00 .*unha/i.test(resumo[1]!);
      return ok ? null : `agenda final ${JSON.stringify(resumo)}, esperado ${JSON.stringify(esperado)}`;
    },
  },
];

function verificarCarla11h(c: Chamada[]): string | null {
  const m = de(c, "marcar")[0]?.entrada;
  if (!m) return "não chamou marcar";
  return m.data === "2026-09-29" && m.hora === "11:00" && String(m.cliente).includes("Carla")
    ? null
    : `marcar com ${JSON.stringify(m)}`;
}
