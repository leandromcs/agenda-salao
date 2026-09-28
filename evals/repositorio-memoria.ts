import type { NovoAgendamento, RepositorioAgenda } from "../src/agenda/repositorio";
import { normalizarBusca } from "../src/agenda/repositorio";
import type { Agendamento, Alteracao } from "../src/agenda/tipos";

export class RepositorioMemoria implements RepositorioAgenda {
  private agendamentos: Agendamento[] = [];
  private alteracoes: Alteracao[] = [];

  async listarEntre(de: string, ate: string, nome?: string): Promise<Agendamento[]> {
    return this.agendamentos
      .filter((a) => a.situacao === "marcado" && a.inicio < ate && a.fim > de)
      .filter((a) => !nome || normalizarBusca(a.cliente).includes(normalizarBusca(nome)))
      .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
      .map((a) => ({ ...a }));
  }

  async buscar(id: number): Promise<Agendamento | null> {
    const a = this.agendamentos.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async marcar(novo: NovoAgendamento, agora: string): Promise<Agendamento> {
    const a: Agendamento = { id: this.agendamentos.length + 1, ...novo, situacao: "marcado", criado_em: agora, atualizado_em: agora };
    this.agendamentos.push(a);
    this.registrar(a.id, "marcar", null, agora);
    return { ...a };
  }

  async remarcar(id: number, inicio: string, fim: string, antes: Agendamento, agora: string): Promise<Agendamento> {
    const a = this.pegar(id);
    Object.assign(a, { inicio, fim, atualizado_em: agora });
    this.registrar(id, "remarcar", JSON.stringify(antes), agora);
    return { ...a };
  }

  async desmarcar(id: number, antes: Agendamento, agora: string): Promise<Agendamento> {
    const a = this.pegar(id);
    Object.assign(a, { situacao: "cancelado", atualizado_em: agora });
    this.registrar(id, "desmarcar", JSON.stringify(antes), agora);
    return { ...a };
  }

  async ultimaAlteracaoPendente(): Promise<Alteracao | null> {
    const pendentes = this.alteracoes.filter((x) => x.desfeita === 0);
    return pendentes.length ? { ...pendentes[pendentes.length - 1]! } : null;
  }

  async desfazer(alteracao: Alteracao, agora: string): Promise<Agendamento> {
    const a = this.pegar(alteracao.agendamento_id);
    if (alteracao.acao === "marcar") a.situacao = "cancelado";
    else if (alteracao.acao === "desmarcar") a.situacao = "marcado";
    else {
      const antes = JSON.parse(alteracao.antes ?? "{}") as Agendamento;
      a.inicio = antes.inicio;
      a.fim = antes.fim;
    }
    a.atualizado_em = agora;
    this.alteracoes.find((x) => x.id === alteracao.id)!.desfeita = 1;
    return { ...a };
  }

  private pegar(id: number): Agendamento {
    const a = this.agendamentos.find((x) => x.id === id);
    if (!a) throw new Error(`Agendamento ${id} não existe`);
    return a;
  }

  private registrar(agendamentoId: number, acao: Alteracao["acao"], antes: string | null, agora: string): void {
    this.alteracoes.push({ id: this.alteracoes.length + 1, agendamento_id: agendamentoId, acao, antes, desfeita: 0, criado_em: agora });
  }
}
