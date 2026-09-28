import Anthropic from "@anthropic-ai/sdk";
import { AgendaServico } from "../src/agenda/servico";
import { responder } from "../src/assistente/assistente";
import { montarSistema } from "../src/assistente/prompt";
import { CASOS, ROTEIROS, type Chamada } from "./casos";
import { RepositorioMemoria } from "./repositorio-memoria";

const AGORA = new Date("2026-09-28T13:00:00Z");
const JANELA = { janelaInicio: "08:00", janelaFim: "20:00" };
const MODELO = process.env.MODELO_CLAUDE ?? "claude-haiku-4-5";

// EVAL_FILTRO: roda só os casos/roteiros cujo nome contém o texto. EVAL_REPETICOES: quantas vezes rodar cada um.
const FILTRO = process.env.EVAL_FILTRO?.toLowerCase();
const REPETICOES = Math.max(1, Number(process.env.EVAL_REPETICOES) || 1);
const escolhido = (nome: string) => !FILTRO || nome.toLowerCase().includes(FILTRO);
const repetir = <T>(xs: T[]) => xs.flatMap((x) => Array.from({ length: REPETICOES }, () => x));

const anthropic = new Anthropic();
const cliente = { messages: { create: (p: Anthropic.MessageCreateParamsNonStreaming) => anthropic.messages.create(p) } };
const sistema = montarSistema({ agora: AGORA, ...JANELA });
let total = 0;
let falhas = 0;
let travas = 0;

async function novaAgenda(seed: Parameters<RepositorioMemoria["marcar"]>[0][] = []) {
  const repo = new RepositorioMemoria();
  for (const a of seed) await repo.marcar(a, AGORA.toISOString());
  return { repo, agenda: new AgendaServico(repo, JANELA, () => AGORA) };
}

for (const caso of repetir(CASOS.filter((c) => escolhido(c.nome)))) {
  const { agenda } = await novaAgenda(caso.agenda);
  const r = await responder({ cliente, modelo: MODELO, sistema, historico: caso.historico ?? [], entrada: caso.entrada, agenda });
  travas += r.correcoes;
  const erro = caso.verificar(r.chamadas as Chamada[], r.texto);
  total++;
  if (erro) falhas++;
  console.log(`${erro ? "❌" : "✅"} ${caso.nome}${erro ? ` — ${erro}` : ""}${r.correcoes ? " (trava acionada)" : ""}`);
  if (erro) {
    console.log(`   ferramentas: ${r.chamadas.map((c) => c.nome).join(", ") || "(nenhuma)"}`);
    console.log(`   resposta: ${r.texto.replace(/\n/g, " ⏎ ")}`);
  }
}

for (const roteiro of repetir(ROTEIROS.filter((r) => escolhido(r.nome)))) {
  const { repo, agenda } = await novaAgenda(roteiro.agenda);
  const historico: Anthropic.MessageParam[] = [];
  const transcricao: string[] = [];
  let travasRoteiro = 0;
  for (const passo of roteiro.passos) {
    const r = await responder({ cliente, modelo: MODELO, sistema, historico, entrada: passo, agenda });
    historico.push(...r.registro);
    travasRoteiro += r.correcoes;
    transcricao.push(`   ela: ${passo}`, `   assistente [${r.chamadas.map((c) => c.nome).join(", ") || "-"}]: ${r.texto.replace(/\n/g, " ⏎ ")}`);
  }
  travas += travasRoteiro;
  const erro = roteiro.verificar(repo.todosMarcados());
  total++;
  if (erro) falhas++;
  console.log(`${erro ? "❌" : "✅"} ${roteiro.nome}${erro ? ` — ${erro}` : ""}${travasRoteiro ? ` (trava acionada ${travasRoteiro}x)` : ""}`);
  if (erro) console.log(transcricao.join("\n"));
}

console.log(`\n${total - falhas}/${total} execuções passaram com ${MODELO}. Trava acionada ${travas}x.`);
process.exit(falhas > 0 ? 1 : 0);
