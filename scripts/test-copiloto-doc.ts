import assert from "node:assert/strict";
import { conversaParaTexto, sistemaCopiloto, validarCopiloto } from "../src/lib/copiloto-doc";

const ok = validarCopiloto({
  rascunho: "Hoje a paciente típica tem 35 a 50 anos, chega pelo Instagram (62% das conversas) e procura botox — ticket [confirmar].",
  perguntas: [
    { pergunta: "Qual serviço a doutora quer priorizar nos 90 dias?", por_que: "Muda o público desejado.", opcoes: ["Botox", "Radiesse", "Laser", "Outro", "Quinta"] },
    { pergunta: "?", por_que: "", opcoes: [] },
    { pergunta: "Qual o ticket desejado por paciente?", por_que: "Define a meta.", opcoes: [] },
    { pergunta: "Atende convênio?", por_que: "", opcoes: [] },
    { pergunta: "Quarta pergunta não pode passar", por_que: "", opcoes: [] },
  ],
  fontes: ["conversas do WhatsApp (n = 212)"],
  aprendidos: [
    { memoria: "comercial", chave: "servico_prioritario", valor: "Botox é o serviço prioritário nos 90 dias." },
    { memoria: "comercial", chave: "servico_prioritario", valor: "duplicado" },
    { memoria: "inventada", chave: "x_y", valor: "memória que não existe" },
    { memoria: "audiencia", chave: "Chave Ruim", valor: "chave fora do padrão" },
    { memoria: "comercial", chave: "ja_aprovado", valor: "já está no Brain" },
    { memoria: "comercial", chave: "telefone", valor: "Ligue (67) 99999-8888" },
  ],
  confianca: "media",
}, new Set(["comercial.ja_aprovado"]))!;
assert.ok(ok);
assert.ok(!ok.rascunho.includes("—"), "sem travessão");
assert.equal(ok.perguntas.length, 2, "no máximo 3 entradas lidas, a vazia sai");
assert.equal(ok.perguntas[0].opcoes.length, 4);
assert.deepEqual(ok.aprendidos.map((a) => a.chave), ["servico_prioritario"]);
assert.equal(validarCopiloto({ rascunho: "curto" }, new Set()), null);
assert.equal(validarCopiloto({ rascunho: "Paciente Maria, telefone (11) 98888-7777, gostou muito." }, new Set()), null, "dado pessoal derruba");
assert.match(sistemaCopiloto("Paciente ideal: atual", "Quem é"), /no máximo 3 perguntas/);
assert.match(conversaParaTexto([{ papel: "ia", texto: "Rascunho" }, { papel: "equipe", texto: "Botox" }]), /IA: Rascunho\n\nEquipe: Botox/);
console.log("copiloto-doc: ok");
