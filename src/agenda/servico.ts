import {
  agoraIso,
  dataCurta,
  dataDe,
  dataValida,
  horaDe,
  horaValida,
  minutosEntre,
  paraIso,
  somarDias,
  somarMinutos,
} from "../tempo";
import { conflitos, horariosLivres } from "./regras";
import type { RepositorioAgenda } from "./repositorio";
import type { Agendamento, TipoAgendamento } from "./tipos";

export interface AgendamentoResumo {
  id: number;
  cliente: string;
  data: string;
  dia: string;
  inicio: string;
  fim: string;
  servico: string | null;
  tipo: TipoAgendamento;
}

export function resumir(a: Agendamento): AgendamentoResumo {
  const data = dataDe(a.inicio);
  return {
    id: a.id,
    cliente: a.cliente,
    data,
    dia: dataCurta(data),
    inicio: horaDe(a.inicio),
    fim: horaDe(a.fim),
    servico: a.servico,
    tipo: a.tipo,
  };
}

export type Falha = { ok: false; erro: string; conflitos?: AgendamentoResumo[] };
export type Resultado<T> = ({ ok: true } & T) | Falha;

export interface EntradaConsultar {
  data_inicio: string;
  data_fim: string;
  nome?: string;
}
export interface EntradaLivres {
  data: string;
  duracao_min: number;
  faixa_inicio?: string;
  faixa_fim?: string;
}
export interface EntradaMarcar {
  cliente: string;
  data: string;
  hora: string;
  duracao_min: number;
  servico?: string;
  observacao?: string;
  tipo?: TipoAgendamento;
  confirmado_sobreposicao?: boolean;
}
export interface EntradaRemarcar {
  id: number;
  data: string;
  hora: string;
  duracao_min?: number;
  confirmado_sobreposicao?: boolean;
}
export interface EntradaDesmarcar {
  id: number;
}

export interface OperacoesAgenda {
  consultar(e: EntradaConsultar): Promise<Resultado<{ agendamentos: AgendamentoResumo[] }>>;
  livres(e: EntradaLivres): Promise<Resultado<{ livres: { inicio: string; fim: string }[] }>>;
  marcar(e: EntradaMarcar): Promise<Resultado<{ agendamento: AgendamentoResumo }>>;
  remarcar(e: EntradaRemarcar): Promise<Resultado<{ agendamento: AgendamentoResumo; antes: AgendamentoResumo }>>;
  desmarcar(e: EntradaDesmarcar): Promise<Resultado<{ agendamento: AgendamentoResumo }>>;
  desfazer(): Promise<Resultado<{ descricao: string }>>;
}

export interface ConfigAgenda {
  janelaInicio: string;
  janelaFim: string;
}

const DURACAO_MIN = 5;
const DURACAO_MAX = 720;
const INTERVALO_MAX_DIAS = 62;

function falha(erro: string, conflitosEncontrados?: AgendamentoResumo[]): Falha {
  return conflitosEncontrados ? { ok: false, erro, conflitos: conflitosEncontrados } : { ok: false, erro };
}

function erroDataHora(data: unknown, hora: unknown): string | null {
  if (typeof data !== "string" || !dataValida(data)) return "Data inválida. Use AAAA-MM-DD.";
  if (typeof hora !== "string" || !horaValida(hora)) return "Hora inválida. Use HH:MM (24h).";
  return null;
}

function erroDuracao(duracao: unknown): string | null {
  if (typeof duracao !== "number" || !Number.isInteger(duracao) || duracao < DURACAO_MIN || duracao > DURACAO_MAX) {
    return `Duração inválida. Informe minutos inteiros entre ${DURACAO_MIN} e ${DURACAO_MAX}.`;
  }
  return null;
}

function erroHoraOpcional(nome: string, valor: unknown): string | null {
  if (valor === undefined) return null;
  return typeof valor === "string" && horaValida(valor) ? null : `${nome} inválida. Use HH:MM.`;
}

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function inicioDoDia(data: string): string {
  return paraIso(data, "00:00");
}

export class AgendaServico implements OperacoesAgenda {
  constructor(
    private readonly repo: RepositorioAgenda,
    private readonly config: ConfigAgenda,
    private readonly relogio: () => Date,
  ) {}

  private agora(): string {
    return this.relogio().toISOString();
  }

  async consultar(e: EntradaConsultar): Promise<Resultado<{ agendamentos: AgendamentoResumo[] }>> {
    if (typeof e.data_inicio !== "string" || !dataValida(e.data_inicio)) return falha("data_inicio inválida. Use AAAA-MM-DD.");
    if (typeof e.data_fim !== "string" || !dataValida(e.data_fim)) return falha("data_fim inválida. Use AAAA-MM-DD.");
    if (e.data_fim < e.data_inicio) return falha("data_fim é anterior a data_inicio.");
    if (somarDias(e.data_inicio, INTERVALO_MAX_DIAS) < e.data_fim) return falha(`Consulte no máximo ${INTERVALO_MAX_DIAS} dias por vez.`);
    const nome = textoOpcional(e.nome) ?? undefined;
    const lista = await this.repo.listarEntre(inicioDoDia(e.data_inicio), inicioDoDia(somarDias(e.data_fim, 1)), nome);
    return { ok: true, agendamentos: lista.map(resumir) };
  }

  async livres(e: EntradaLivres): Promise<Resultado<{ livres: { inicio: string; fim: string }[] }>> {
    if (typeof e.data !== "string" || !dataValida(e.data)) return falha("Data inválida. Use AAAA-MM-DD.");
    const erro = erroDuracao(e.duracao_min) ?? erroHoraOpcional("faixa_inicio", e.faixa_inicio) ?? erroHoraOpcional("faixa_fim", e.faixa_fim);
    if (erro) return falha(erro);
    const ocupados = await this.repo.listarEntre(inicioDoDia(e.data), inicioDoDia(somarDias(e.data, 1)));
    const livres = horariosLivres(
      {
        data: e.data,
        duracaoMin: e.duracao_min,
        janelaInicio: this.config.janelaInicio,
        janelaFim: this.config.janelaFim,
        faixaInicio: e.faixa_inicio,
        faixaFim: e.faixa_fim,
        aPartirDe: agoraIso(this.relogio()),
      },
      ocupados,
    );
    return { ok: true, livres: livres.map((l) => ({ inicio: horaDe(l.inicio), fim: horaDe(l.fim) })) };
  }

  async marcar(e: EntradaMarcar): Promise<Resultado<{ agendamento: AgendamentoResumo }>> {
    const cliente = textoOpcional(e.cliente);
    if (!cliente) return falha("Informe o nome da cliente (ou a descrição do bloqueio).");
    if (cliente.length > 100) return falha("Nome muito longo (máximo 100 caracteres).");
    const erro = erroDataHora(e.data, e.hora) ?? erroDuracao(e.duracao_min);
    if (erro) return falha(erro);

    const inicio = paraIso(e.data, e.hora);
    const fim = somarMinutos(inicio, e.duracao_min);
    if (e.confirmado_sobreposicao !== true) {
      const choques = conflitos({ inicio, fim }, await this.repo.listarEntre(inicio, fim));
      if (choques.length > 0) {
        return falha("Sobreposição: NÃO marquei. Pergunte se deve marcar mesmo assim.", choques.map(resumir));
      }
    }
    const tipo: TipoAgendamento = e.tipo === "bloqueio" ? "bloqueio" : "atendimento";
    const criado = await this.repo.marcar(
      { cliente, inicio, fim, servico: textoOpcional(e.servico), observacao: textoOpcional(e.observacao), tipo },
      this.agora(),
    );
    return { ok: true, agendamento: resumir(criado) };
  }

  async remarcar(e: EntradaRemarcar): Promise<Resultado<{ agendamento: AgendamentoResumo; antes: AgendamentoResumo }>> {
    if (!Number.isInteger(e.id)) return falha("id inválido.");
    const atual = await this.repo.buscar(e.id);
    if (!atual || atual.situacao !== "marcado") return falha("Agendamento não encontrado ou já cancelado. Consulte a agenda de novo.");
    const duracao = e.duracao_min ?? minutosEntre(atual.inicio, atual.fim);
    const erro = erroDataHora(e.data, e.hora) ?? erroDuracao(duracao);
    if (erro) return falha(erro);

    const inicio = paraIso(e.data, e.hora);
    const fim = somarMinutos(inicio, duracao);
    if (e.confirmado_sobreposicao !== true) {
      const choques = conflitos({ inicio, fim }, await this.repo.listarEntre(inicio, fim), atual.id);
      if (choques.length > 0) {
        return falha("Sobreposição: NÃO remarquei. Pergunte se deve remarcar mesmo assim.", choques.map(resumir));
      }
    }
    const novo = await this.repo.remarcar(atual.id, inicio, fim, atual, this.agora());
    return { ok: true, agendamento: resumir(novo), antes: resumir(atual) };
  }

  async desmarcar(e: EntradaDesmarcar): Promise<Resultado<{ agendamento: AgendamentoResumo }>> {
    if (!Number.isInteger(e.id)) return falha("id inválido.");
    const atual = await this.repo.buscar(e.id);
    if (!atual || atual.situacao !== "marcado") return falha("Agendamento não encontrado ou já cancelado. Consulte a agenda de novo.");
    const cancelado = await this.repo.desmarcar(atual.id, atual, this.agora());
    return { ok: true, agendamento: resumir(cancelado) };
  }

  async desfazer(): Promise<Resultado<{ descricao: string }>> {
    const alteracao = await this.repo.ultimaAlteracaoPendente();
    if (!alteracao) return falha("Não há nenhuma alteração para desfazer.");
    const r = resumir(await this.repo.desfazer(alteracao, this.agora()));
    const quando = `${r.dia} ${r.inicio}–${r.fim}`;
    const descricao =
      alteracao.acao === "marcar"
        ? `Cancelei a marcação de ${r.cliente} (${quando}).`
        : alteracao.acao === "remarcar"
          ? `${r.cliente} voltou para ${quando}.`
          : `${r.cliente} voltou a estar marcada (${quando}).`;
    return { ok: true, descricao };
  }
}
