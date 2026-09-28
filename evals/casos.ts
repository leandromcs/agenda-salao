import type { NovoAgendamento } from "../src/agenda/repositorio";
import type { Turno } from "../src/conversa/historico";
import { PREFIXO_ENCAMINHADA } from "../src/conversa/normalizador";

export interface Chamada {
  nome: string;
  entrada: Record<string, unknown>;
}

export interface Caso {
  nome: string;
  agenda?: NovoAgendamento[];
  historico?: Turno[];
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
      { papel: "user", conteudo: "passa a Ana de sexta para as 16h" },
      { papel: "assistant", conteudo: "Vou mudar a Ana de sex 02/10 14:30–15:30 para 16:00–17:00. Confirma?" },
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
      { papel: "user", conteudo: "marca a Ana sexta 14:30, 1h" },
      { papel: "assistant", conteudo: "✅ Marquei Ana, sex 02/10, 14:30–15:30." },
    ],
    entrada: "desfaz",
    verificar: (c) => (de(c, "desfazer").length === 1 ? null : "não chamou desfazer"),
  },
  {
    nome: "encaminhada sem nome não marca",
    entrada: `${PREFIXO_ENCAMINHADA}\nOi! Tem horário sexta à tarde pra escova?`,
    verificar: (c, t) => (alteracoes(c).length === 0 && t.includes("?") ? null : "marcou ou não perguntou"),
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
];
