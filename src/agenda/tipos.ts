export type TipoAgendamento = "atendimento" | "bloqueio";
export type Situacao = "marcado" | "cancelado";

export interface Intervalo {
  inicio: string;
  fim: string;
}

export interface Agendamento extends Intervalo {
  id: number;
  cliente: string;
  servico: string | null;
  observacao: string | null;
  tipo: TipoAgendamento;
  situacao: Situacao;
  criado_em: string;
  atualizado_em: string;
}

export type Acao = "marcar" | "remarcar" | "desmarcar";

export interface Alteracao {
  id: number;
  agendamento_id: number;
  acao: Acao;
  /** JSON do Agendamento antes da alteração (null para "marcar"). */
  antes: string | null;
  desfeita: number;
  criado_em: string;
}
