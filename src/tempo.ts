/** Brasília não tem horário de verão desde 2019: offset fixo de -03:00. */
const OFFSET_MS = -3 * 60 * 60 * 1000;
const SUFIXO = "-03:00";
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const DIAS_EXTENSO = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function dataValida(data: string): boolean {
  if (!RE_DATA.test(data)) return false;
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

export function horaValida(hora: string): boolean {
  return RE_HORA.test(hora);
}

/** "2026-10-02" + "14:00" -> "2026-10-02T14:00:00-03:00" */
export function paraIso(data: string, hora: string): string {
  if (!dataValida(data)) throw new Error(`Data inválida: ${data}`);
  if (!horaValida(hora)) throw new Error(`Hora inválida: ${hora}`);
  return `${data}T${hora}:00${SUFIXO}`;
}

function deDate(d: Date): string {
  const local = new Date(d.getTime() + OFFSET_MS);
  return `${local.toISOString().slice(0, 16)}:00${SUFIXO}`;
}

export function somarMinutos(iso: string, minutos: number): string {
  return deDate(new Date(new Date(iso).getTime() + minutos * 60_000));
}

export function minutosEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000);
}

export function dataDe(iso: string): string {
  return iso.slice(0, 10);
}

export function horaDe(iso: string): string {
  return iso.slice(11, 16);
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/** Instante atual em Brasília, truncado no minuto. */
export function agoraIso(agora: Date): string {
  return deDate(agora);
}

export function hojeEm(agora: Date): string {
  return dataDe(deDate(agora));
}

export function dataCurta(data: string): string {
  return `${DIAS[diaDaSemana(data)]!} ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function dataExtenso(data: string): string {
  return `${DIAS_EXTENSO[diaDaSemana(data)]!}, ${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}
