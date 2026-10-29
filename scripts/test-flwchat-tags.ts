import assert from "node:assert/strict";
import { lerTagsDosContatos, type PaginaContatos } from "../api/_lib/flwchat-sync";

const nomes = new Map([["t1", "Origem · Instagram"], ["t2", "Tipo · Paciente"]]);

// 250 contatos fictícios em páginas de 100, por data de criação.
const contatos = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}`, tagIds: i % 2 ? ["t1"] : [], updatedAt: `2026-10-01T00:00:${String(i % 60).padStart(2, "0")}Z` }));
const paginar = (lista: typeof contatos, pagina: number): PaginaContatos => ({
  itens: lista.slice((pagina - 1) * 100, pagina * 100),
  temMais: pagina * 100 < lista.length,
  totalPaginas: Math.ceil(lista.length / 100),
});

async function main() {
  const salvos = new Map<string, string[]>();
  const salvar = async (linhas: Array<{ contato_id: string; tags: string[] }>) => { for (const l of linhas) salvos.set(l.contato_id, l.tags); };
  const pedidas: string[] = [];
  const buscarPagina = async (modo: "varredura" | "alteracoes", pagina: number) => { pedidas.push(`${modo}:${pagina}`); return paginar(contatos, pagina); };

  // Primeira rodada com teto de 2 páginas: lê 200, guarda o progresso, avisa que a origem fica parcial.
  const r1 = await lerTagsDosContatos({ estado: {}, nomes, buscarPagina, salvar, agora: "2026-10-29T12:00:00Z", maxPaginas: 2 });
  assert.equal(r1.completa, false);
  assert.deepEqual(r1.estado, { tags_ate: null, tags_varredura: { pagina: 3, inicio: "2026-10-29T12:00:00Z" } });
  assert.match(r1.aviso!, /primeira leitura em andamento \(página 2 de 3\)/);
  assert.equal(salvos.size, 200);
  // Contato sem tag fica gravado com lista vazia (lido, sem tag); com tag, pelo nome.
  assert.deepEqual(salvos.get("c0"), []);
  assert.deepEqual(salvos.get("c1"), ["Origem · Instagram"]);

  // Segunda rodada retoma da página 3, termina e fixa o marco no início da varredura.
  pedidas.length = 0;
  const r2 = await lerTagsDosContatos({ estado: r1.estado, nomes, buscarPagina, salvar, agora: "2026-10-30T12:00:00Z", maxPaginas: 2 });
  assert.deepEqual(pedidas, ["varredura:3"]);
  assert.equal(r2.completa, true);
  assert.equal(r2.aviso, null);
  assert.deepEqual(r2.estado, { tags_ate: "2026-10-29T12:00:00Z", tags_varredura: null });
  assert.equal(salvos.size, 250);

  // Depois: só os alterados desde o marco, do mais novo para o mais antigo; para no primeiro já lido.
  const alterados = [
    { id: "c5", tagIds: ["t1", "t2"], updatedAt: "2026-10-30T09:00:00Z" },
    { id: "novo", tagIds: ["t1"], updatedAt: "2026-10-30T08:00:00Z" },
    { id: "c9", tagIds: [], updatedAt: "2026-10-28T00:00:00Z" },
  ];
  pedidas.length = 0;
  const r3 = await lerTagsDosContatos({
    estado: r2.estado, nomes, salvar, agora: "2026-10-30T12:00:00Z",
    buscarPagina: async (modo, pagina) => { pedidas.push(`${modo}:${pagina}`); return { itens: alterados, temMais: true }; },
  });
  assert.deepEqual(pedidas, ["alteracoes:1"]);
  assert.equal(r3.estado.tags_ate, "2026-10-30T09:00:00Z");
  assert.deepEqual(salvos.get("c5"), ["Origem · Instagram", "Tipo · Paciente"]);
  assert.deepEqual(salvos.get("novo"), ["Origem · Instagram"]);
  // c9 não mudou desde o marco: continua com o que já tinha (c9 tinha a tag de origem).
  assert.deepEqual(salvos.get("c9"), ["Origem · Instagram"]);

  // Alterações que não cabem na rodada: o marco não avança, para nada ficar para trás.
  const r4 = await lerTagsDosContatos({
    estado: { tags_ate: "2026-10-30T09:00:00Z" }, nomes, salvar, agora: "2026-10-31T12:00:00Z", maxPaginas: 1,
    buscarPagina: async () => ({ itens: [{ id: "x", tagIds: [], updatedAt: "2026-10-31T10:00:00Z" }], temMais: true }),
  });
  assert.equal(r4.estado.tags_ate, "2026-10-30T09:00:00Z");
  assert.match(r4.aviso!, /continuam na próxima/);
  console.log("test-flwchat-tags: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
