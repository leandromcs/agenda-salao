import { minutosEntre, paraIso } from "../tempo";
import type { Agendamento, Intervalo } from "./tipos";

export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

export function conflitos(novo: Intervalo, existentes: Agendamento[], ignorarId?: number): Agendamento[] {
  return existentes.filter((e) => e.situacao === "marcado" && e.id !== ignorarId && sobrepoe(novo, e));
}

export interface OpcoesLivres {
  data: string;
  duracaoMin: number;
  janelaInicio: string;
  janelaFim: string;
  faixaInicio?: string;
  faixaFim?: string;
  /** Instante (ISO) antes do qual nada é oferecido — "agora", para não sugerir horário que já passou. */
  aPartirDe?: string;
}

function ordemPorInicio(a: Intervalo, b: Intervalo): number {
  return a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0;
}

export function horariosLivres(opcoes: OpcoesLivres, ocupados: Intervalo[]): Intervalo[] {
  const inicioHora =
    opcoes.faixaInicio && opcoes.faixaInicio > opcoes.janelaInicio ? opcoes.faixaInicio : opcoes.janelaInicio;
  const fimHora = opcoes.faixaFim && opcoes.faixaFim < opcoes.janelaFim ? opcoes.faixaFim : opcoes.janelaFim;
  if (inicioHora >= fimHora) return [];

  const limite = paraIso(opcoes.data, fimHora);
  let cursor = paraIso(opcoes.data, inicioHora);
  if (opcoes.aPartirDe && opcoes.aPartirDe > cursor) cursor = opcoes.aPartirDe;
  if (cursor >= limite) return [];
  const relevantes = ocupados
    .filter((o) => sobrepoe(o, { inicio: cursor, fim: limite }))
    .sort(ordemPorInicio);

  const livres: Intervalo[] = [];
  for (const o of relevantes) {
    if (o.inicio > cursor) livres.push({ inicio: cursor, fim: o.inicio });
    if (o.fim > cursor) cursor = o.fim;
  }
  if (cursor < limite) livres.push({ inicio: cursor, fim: limite });

  return livres.filter((l) => minutosEntre(l.inicio, l.fim) >= opcoes.duracaoMin);
}
