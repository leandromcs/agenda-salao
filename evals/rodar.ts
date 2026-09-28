import Anthropic from "@anthropic-ai/sdk";
import { AgendaServico } from "../src/agenda/servico";
import { responder } from "../src/assistente/assistente";
import { montarSistema } from "../src/assistente/prompt";
import { CASOS, type Chamada } from "./casos";
import { RepositorioMemoria } from "./repositorio-memoria";

const AGORA = new Date("2026-09-28T13:00:00Z");
const JANELA = { janelaInicio: "08:00", janelaFim: "20:00" };
const MODELO = process.env.MODELO_CLAUDE ?? "claude-haiku-4-5";

const anthropic = new Anthropic();
let falhas = 0;

for (const caso of CASOS) {
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

console.log(`\n${CASOS.length - falhas}/${CASOS.length} casos passaram com ${MODELO}.`);
process.exit(falhas > 0 ? 1 : 0);
