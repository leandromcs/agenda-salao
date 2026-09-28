import Anthropic from "@anthropic-ai/sdk";
import { AgendaServico } from "../src/agenda/servico";
import { responder } from "../src/assistente/assistente";
import { montarSistema } from "../src/assistente/prompt";
import { CASOS, type Chamada } from "./casos";
import { RepositorioMemoria } from "./repositorio-memoria";

const AGORA = new Date("2026-09-28T13:00:00Z");
const JANELA = { janelaInicio: "08:00", janelaFim: "20:00" };
const MODELO = process.env.MODELO_CLAUDE ?? "claude-haiku-4-5";

// EVAL_FILTRO: roda só os casos cujo nome contém o texto. EVAL_REPETICOES: quantas vezes rodar cada caso.
const FILTRO = process.env.EVAL_FILTRO?.toLowerCase();
const REPETICOES = Math.max(1, Number(process.env.EVAL_REPETICOES) || 1);
const selecionados = CASOS.filter((c) => !FILTRO || c.nome.toLowerCase().includes(FILTRO));
const execucoes = selecionados.flatMap((c) => Array.from({ length: REPETICOES }, () => c));

const anthropic = new Anthropic();
let falhas = 0;

for (const caso of execucoes) {
  const repo = new RepositorioMemoria();
  for (const a of caso.agenda ?? []) await repo.marcar(a, AGORA.toISOString());
  const agenda = new AgendaServico(repo, JANELA, () => AGORA);

  const r = await responder({
    cliente: { messages: { create: (p) => anthropic.messages.create(p) } },
    modelo: MODELO,
    sistema: montarSistema({ agora: AGORA, ...JANELA }),
    historico: caso.historico ?? [],
    entrada: caso.entrada,
    agenda,
  });
  const erro = caso.verificar(r.chamadas as Chamada[], r.texto);
  if (erro) falhas++;
  console.log(`${erro ? "❌" : "✅"} ${caso.nome}${erro ? ` — ${erro}` : ""}`);
  if (erro) {
    console.log(`   ferramentas: ${r.chamadas.map((c) => c.nome).join(", ") || "(nenhuma)"}`);
    console.log(`   resposta: ${r.texto.replace(/\n/g, " ⏎ ")}`);
  }
}

console.log(`\n${execucoes.length - falhas}/${execucoes.length} execuções passaram com ${MODELO}.`);
process.exit(falhas > 0 ? 1 : 0);
