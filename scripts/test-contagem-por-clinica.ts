import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import * as guia from "../src/lib/guia-crm";

// Migração 20261114110000 (contagem por clínica e comparecimento) em banco descartável, com dados inventados. Nunca
// conecta à produção. Aplica TODAS as migrações em ordem (as de antes, esta duas vezes, as de depois).
// Com --gerar-reversao, reescreve supabase/operacoes/20261114-reverter-contagem-por-clinica.sql a partir da migração
// (sem esse argumento, confere que o arquivo é exatamente o gerado).
const MIGRACAO = "20261114110000_contagem_por_clinica_e_compareceu.sql";
const REVERSAO = new URL("../supabase/operacoes/20261114-reverter-contagem-por-clinica.sql", import.meta.url);
const AUDITORIA = new URL("../supabase/audits/velocidade-conferencia.sql", import.meta.url);
const MARCA = "[contagem-por-clinica]";
const FUNCOES = [
  "public.pacientes_periodo_calc(uuid,date,date)", "public.pacientes_cards(uuid)", "public.crm_vendas_periodo(uuid,date,date)",
  "public.crm_perfil_para_analise(uuid)", "public.relacionamento_pessoas(uuid,uuid[])", "public.jornada_resumo(uuid)",
  "public.crm_base_viva(uuid)", "public.qualidade_leads_campanha(uuid,date,date)", "public.sap_sinais_auto(uuid,date,date)",
  "public.sap_etapas_para_marcar(uuid)", "public.crm_guia_dados(uuid)", "public.crm_etapas_para_analise(uuid)",
  "public.crm_etapas_kpi_para_analise(uuid)", "public.plano_ticket(uuid)",
];
// Regra do plano 05 (src/lib/guia-crm.ts). Enquanto o plano 05 não estiver junto, o teste compara com este texto.
const RE_DO_PLANO = {
  comp: "(compareceu|atendid[oa]|(consulta|avalia[cç][aã]o|procedimento|cirurgia)s? (realizad|feit)|p[oó]s[- ]?(consulta|procedimento|operat)|em acompanhamento|protocolo finalizado)",
  nao: "(no.?show|n[aã]o compareceu|n[aã]o atendid|faltou|reagend)",
};

const db = new PGlite();
type R = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = U(9001);
const [A, B, C, D, G, FA, FB] = [U(1), U(2), U(3), U(4), U(7), U(5), U(6)]; // clínicas fictícias
const [CX_A, CX_B, CX_C, CX_CF, CX_D, CX_G, CX_FA, CX_FB] = [U(101), U(102), U(103), U(113), U(104), U(107), U(105), U(106)];
const PES = (c: number, i: number) => `aaaaaaaa-0000-4000-8000-${String(c * 1000 + i).padStart(12, "0")}`;

// Datas: as recentes contam a partir de hoje (algumas funções olham 90 ou 180 dias até agora); as do histórico são fixas.
const DIA = 86400000;
const atras = (k: number) => new Date(Date.now() - k * DIA).toISOString();
const dataAtras = (k: number) => atras(k).slice(0, 10);
const somar = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * DIA).toISOString().slice(0, 10);
const meioDia = (d: string) => `${d}T15:00:00Z`; // 12:00 em Brasília

const blocoDeTrocas = (sql: string) => {
  const i = sql.indexOf("-- [trocas:início]"), f = sql.indexOf("-- [trocas:fim]");
  assert.ok(i > 0 && f > i, "o arquivo tem o trecho [trocas:início] ... [trocas:fim]");
  return sql.slice(i, f + "-- [trocas:fim]".length);
};
const constante = (sql: string, nome: string) => {
  const m = sql.match(new RegExp(`${nome} constant text := '([^']*)';`, "g")) ?? [];
  assert.equal(m.length, 1, `${nome} definida uma vez`);
  return m[0].replace(new RegExp(`^${nome} constant text := '`), "").replace(/';$/, "");
};

// O arquivo de reversão é gerado da migração: mesmas trocas, aplicadas ao contrário, e o resultado pronto apagado.
const gerarReversao = (sql: string) => {
  const trocas = blocoDeTrocas(sql).replaceAll("pg_temp.contagem_trocar(", "pg_temp.contagem_desfazer(");
  const comp = constante(sql, "re_compareceu"), nao = constante(sql, "re_nao_compareceu");
  return `-- Reversão da migração 20261114110000_contagem_por_clinica_e_compareceu.sql. NÃO é migração.
-- Rodar só se a conferência de velocidade mostrar mais de 1,5x (supabase/audits/velocidade-conferencia.sql, seção 1:
-- média de alguma função acima de 1,5 vez a de antes). Só o João, no SQL editor de produção, o arquivo inteiro.
--
-- O que faz: em cada função marcada "${MARCA}", troca cada trecho novo pelo trecho antigo, uma vez (o contrário da
-- migração, na ordem inversa). O texto de antes volta exatamente como estava, inclusive o que outras migrações
-- puseram na mesma função (o "Fecharam não se aplica" de 20261114100000). Se um trecho novo não aparecer exatamente
-- uma vez, para e nada muda. Função sem a marca é pulada: rodar de novo não muda nada. Depois apaga o resultado pronto
-- de pacientes_periodo (a próxima leitura recalcula).
-- Conferir depois: seção 0 da conferência de velocidade, "aplicada = false" nas 14 e o md5 igual ao de antes.
-- Arquivo gerado por scripts/test-contagem-por-clinica.ts --gerar-reversao (não editar à mão).
begin;

create or replace function pg_temp.contagem_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  re_compareceu constant text := '${comp}';
  re_nao_compareceu constant text := '${nao}';
  d text := pg_get_functiondef(p_fn);
  novo text;
  i int;
  n int;
begin
  if position('${MARCA}' in d) = 0 then return; end if;
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    novo := replace(replace(p_trocas[i][2], '{RE_COMPARECEU}', re_compareceu), '{RE_NAO_COMPARECEU}', re_nao_compareceu);
    n := (length(d) - length(replace(d, novo, ''))) / length(novo);
    if n <> 1 then
      raise exception '${MARCA} reversão de %: trecho % aparece % vezes (esperado 1). Nada foi alterado: %',
        p_fn, i, n, left(novo, 120);
    end if;
    d := replace(d, novo, p_trocas[i][1]);
  end loop;
  if position('${MARCA}' in d) > 0 then
    raise exception '${MARCA} reversão de %: a marca continua no texto', p_fn;
  end if;
  execute d;
end
$f$;

${trocas}

delete from public.resultado_pronto where funcao = 'pacientes_periodo';

drop function pg_temp.contagem_desfazer(regprocedure, text[]);

commit;
`;
};

try {
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO), "a migração existe");
  const sql = await readFile(new URL(MIGRACAO, pasta), "utf8");

  // ---------------------------------------------------------------- arquivos (sem banco)
  const reversaoGerada = gerarReversao(sql);
  if (process.argv.includes("--gerar-reversao")) {
    await writeFile(REVERSAO, reversaoGerada);
    console.log("reversão regravada");
  }
  const reversao = await readFile(REVERSAO, "utf8");
  assert.equal(reversao, reversaoGerada, "o arquivo de reversão é o gerado da migração (rodar com --gerar-reversao)");

  // Uma regra só: o literal do SQL é o RE_COMPARECEU do guia (plano 05), com a mesma exclusão, nos dois arquivos.
  const g = guia as unknown as Record<string, RegExp | undefined>;
  const reGuia = g.RE_COMPARECEU, naoGuia = g.RE_NAO_COMPARECEU;
  const esperado = reGuia && naoGuia ? { comp: reGuia.source, nao: naoGuia.source } : RE_DO_PLANO;
  if (!reGuia || !naoGuia) console.warn("AVISO: src/lib/guia-crm.ts ainda sem RE_COMPARECEU (plano 05); comparado com o texto do plano");
  else { assert.ok(reGuia.flags.includes("i") && naoGuia.flags.includes("i"), "as duas regras ignoram maiúsculas, como ~*"); }
  for (const arq of [sql, reversao]) {
    assert.equal(constante(arq, "re_compareceu"), esperado.comp, "literal do SQL = RE_COMPARECEU.source");
    assert.equal(constante(arq, "re_nao_compareceu"), esperado.nao, "exclusão do SQL = RE_NAO_COMPARECEU.source");
  }
  assert.equal(esperado.comp, RE_DO_PLANO.comp, "a regra do guia é a do plano");
  // Nenhuma cópia da regra antiga nos trechos novos; a marca em toda função trocada.
  const trocas = blocoDeTrocas(sql);
  assert.ok((sql.match(/\[contagem-por-clinica\]/g) ?? []).length >= 10, "marca em cada trecho");
  const fnsDaMigracao = [...trocas.matchAll(/contagem_trocar\('([^']+)'::regprocedure/g)].map((m) => m[1]);
  assert.deepEqual([...fnsDaMigracao].sort(), [...FUNCOES].sort(), "as 14 funções, uma chamada cada");
  assert.equal((sql.match(/set_config\('request\.jwt\.claims'/g) ?? []).length, 0, "a migração não troca claims");

  // A conferência de velocidade não escreve: nenhuma palavra de escrita fora dos comentários.
  const auditoria = await readFile(AUDITORIA, "utf8");
  assert.match(auditoria, /read only/);
  const semComentario = auditoria.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  assert.doesNotMatch(semComentario, /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|analyze|_reset)\b/i);
  assert.doesNotMatch(auditoria, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "nenhum id no arquivo");

  // ---------------------------------------------------------------- banco
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb,'{}')::jsonb $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  await db.exec("set time zone 'America/Sao_Paulo'");
  const aplicarTexto = async (nome: string, texto: string) => {
    try { await db.exec(`begin;\n${texto}\ncommit;`); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nome} falhou`, { cause: e }); }
  };
  const aplicar = async (f: string) => aplicarTexto(`Migração ${f}`, await readFile(new URL(f, pasta), "utf8"));
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await aplicar(f);

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [ADMIN]);
  await q("insert into app_admins(user_id) values ($1)", [ADMIN]);
  // Admin inventado, só neste banco local (as funções conferem is_app_admin() pelo claim).
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);

  // ---------------------------------------------------------------- dados inventados
  const clinica = (id: string, nome: string) => q("insert into clients(id,name) values ($1,$2)", [id, nome]);
  const conexao = (id: string, c: string, provider: string, sub: string) =>
    q("insert into crm_connections(id,client_id,provider,subdomain,active,config) values ($1,$2,$3,$4,true,'{}')", [id, c, provider, sub]);
  const etapas = async (cx: string, lista: [string, string][]) => {
    for (const [s, nome] of lista)
      await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial',$2,$3)", [cx, s, nome]);
  };
  let nLead = 0;
  const lead = async (cx: string, c: string, provider: string, o: { ext?: string; status: string; outcome?: string; price?: number | null;
    em: string; pessoa?: string | null; raw?: R; source?: string | null }) => {
    const ext = o.ext ?? `L${++nLead}`;
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name,pessoa_id,source)
      values ($1,$2,$3,$4,'sync',$5::jsonb,'p1',$6,$7,$8,$9,$10,$11,$12)`,
      [cx, c, provider, ext, JSON.stringify(o.raw ?? {}), o.status, o.outcome ?? "open", o.price ?? null, o.em, `Pessoa ${ext}`, o.pessoa ?? null, o.source ?? null]);
    return ext;
  };
  const ETAPAS_KOMMO: [string, string][] = [["s_novo", "Novo contato"], ["s_ag", "Consulta agendada"], ["s_conf", "Confirmado"],
    ["s_cr", "Consulta realizada"], ["s_ganho", "Fechado"], ["s_perd", "Perdido"]];

  // A e B: a MESMA conta Kommo copiada em duas conexões (mesmo subdomínio). A inclui o campo X; B exclui o campo X.
  // 10 cards por conexão, 6 com o campo X. Cada clínica tem as suas pessoas.
  type Modelo = { x: boolean; status: string; outcome: string; price: number | null; motivo?: string };
  const MODELO: Modelo[] = [
    { x: true, status: "s_ganho", outcome: "won", price: 100 }, { x: true, status: "s_ganho", outcome: "won", price: 200 },
    { x: true, status: "s_ganho", outcome: "won", price: 300 }, { x: true, status: "s_ganho", outcome: "won", price: 400 },
    { x: true, status: "s_ganho", outcome: "won", price: 500 }, { x: true, status: "s_conf", outcome: "open", price: null },
    { x: false, status: "s_cr", outcome: "open", price: null }, { x: false, status: "s_perd", outcome: "lost", price: null, motivo: "77" },
    { x: false, status: "s_conf", outcome: "open", price: null }, { x: false, status: "s_ganho", outcome: "won", price: 9000 },
  ];
  const CAMPO_X = { field_id: 900, field_name: "Médico", values: [{ value: "Médico X" }] };
  for (const [c, cx, k] of [[A, CX_A, 1], [B, CX_B, 2]] as const) {
    await clinica(c, `Clínica fictícia ${k}`);
    await conexao(cx, c, "kommo", "conta-compartilhada-ficticia");
    await etapas(cx, ETAPAS_KOMMO);
    await q("insert into sap_etapa_sinal(crm_connection_id,pipeline_id,status_id,sinal) values ($1,'p1','s_conf','confirmado')", [cx]);
    for (let i = 0; i < MODELO.length; i++) {
      const m = MODELO[i];
      await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [PES(k, i), c, `Pessoa ${k}-${i}`]);
      await lead(cx, c, "kommo", { ext: `k${i + 1}`, status: m.status, outcome: m.outcome, price: m.price, em: atras(10 + i), pessoa: PES(k, i),
        raw: { ...(m.x ? { custom_fields_values: [CAMPO_X] } : {}), ...(m.motivo ? { loss_reason_id: m.motivo } : {}) } });
    }
  }
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,valor,modo) values ($1,$2,'campo','900=Médico X','incluir'),($3,$4,'campo','900=Médico X','excluir')",
    [A, CX_A, B, CX_B]);
  // FA e FB: a mesma conta FlwChat em duas conexões, separada pela etiqueta "Médico X" (crm_etapas_para_analise só lê FlwChat).
  for (const [c, cx, k] of [[FA, CX_FA, 5], [FB, CX_FB, 6]] as const) {
    await clinica(c, `Clínica fictícia ${k}`);
    await conexao(cx, c, "flwchat", "conta-flw-ficticia");
    await etapas(cx, [["f1", "Novo"], ["f2", "Compareceu"]]);
    for (let i = 0; i < 10; i++)
      await lead(cx, c, "flwchat", { ext: `f${i + 1}`, status: i % 2 ? "f2" : "f1", em: atras(5 + i), raw: i < 6 ? { etiquetas: ["Médico X"] } : {} });
  }
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,valor,modo) values ($1,$2,'tag','Médico X','incluir'),($3,$4,'tag','Médico X','excluir')",
    [FA, CX_FA, FB, CX_FB]);

  // C: clínica sem filtro, Kommo e FlwChat, com etapas que a regra antiga e a nova leem igual.
  await clinica(C, "Clínica fictícia 3");
  await conexao(CX_C, C, "kommo", "conta-c-ficticia");
  await conexao(CX_CF, C, "flwchat", "conta-c-flw-ficticia");
  await etapas(CX_C, ETAPAS_KOMMO);
  await etapas(CX_CF, [["f1", "Novo"], ["f2", "Compareceu"]]);
  await q("insert into sap_etapa_sinal(crm_connection_id,pipeline_id,status_id,sinal) values ($1,'p1','s_conf','confirmado')", [CX_C]);
  await q("insert into meta_ads_campaigns(client_id,ad_account_id,campaign_id,name) values ($1,'act_1','5550001','Campanha fictícia')", [C]);
  const utm = (id: string) => ({ custom_fields_values: [{ field_code: "UTM_CAMPAIGNID", values: [{ value: id }] }] });
  const C_LEADS: [string, string, number | null, number, R][] = [
    ["s_novo", "open", null, 3, utm("5550001")], ["s_ag", "open", null, 4, utm("5550001")], ["s_conf", "open", null, 6, {}],
    ["s_cr", "open", null, 8, {}], ["s_cr", "won", 1200, 9, utm("5550001")], ["s_ganho", "won", 800, 12, {}],
    ["s_ganho", "won", 650, 15, {}], ["s_ganho", "won", 900, 18, {}], ["s_ganho", "won", 1500, 20, {}],
    ["s_perd", "lost", null, 22, { loss_reason_id: "41" }], ["s_ag", "open", null, 25, {}], ["s_novo", "open", null, 200, {}],
  ];
  for (let i = 0; i < C_LEADS.length; i++) {
    const [status, outcome, price, k, raw] = C_LEADS[i];
    await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [PES(3, i), C, `Pessoa 3-${i}`]);
    await lead(CX_C, C, "kommo", { ext: `c${i + 1}`, status, outcome, price, em: atras(k), pessoa: i === 11 ? null : PES(3, i), raw, source: i % 3 ? "Instagram" : null });
  }
  for (let i = 0; i < 4; i++) await lead(CX_CF, C, "flwchat", { ext: `cf${i + 1}`, status: i % 2 ? "f2" : "f1", em: atras(7 + i) });

  // D: regra do nome. "Em acompanhamento" conta como compareceu; "Contato realizado" e "No-show" não.
  const DD = "2026-09-10";
  await clinica(D, "Clínica fictícia 4");
  await conexao(CX_D, D, "clint", "conta-d-ficticia");
  await etapas(CX_D, [["d_ag", "Consulta agendada"], ["d_acomp", "Em acompanhamento"], ["d_contato", "Contato realizado"], ["d_noshow", "No-show"]]);
  for (let i = 0; i < 4; i++) await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [PES(4, i), D, `Pessoa 4-${i}`]);
  await lead(CX_D, D, "clint", { ext: "d1", status: "d_ag", em: meioDia(somar(DD, -1)), pessoa: PES(4, 0) });
  await lead(CX_D, D, "clint", { ext: "d2", status: "d_acomp", em: meioDia(DD), pessoa: PES(4, 1) });
  await lead(CX_D, D, "clint", { ext: "d3", status: "d_contato", em: meioDia(DD), pessoa: PES(4, 2) });
  await lead(CX_D, D, "clint", { ext: "d4", status: "d_noshow", em: meioDia(DD), pessoa: PES(4, 3) });

  // G: trava de um dia. Entrada em "Consulta realizada" em T0; agendamento em T1 = T0+10 e em T2 = T0+45.
  const T0 = "2026-08-01", T1 = somar(T0, 10), T2 = somar(T0, 45);
  await clinica(G, "Clínica fictícia 7");
  await conexao(CX_G, G, "clint", "conta-g-ficticia");
  await etapas(CX_G, [["g_novo", "Novo contato"], ["g_ag", "Consulta agendada"], ["g_cr", "Consulta realizada"], ["g_ganho", "Fechado"]]);
  await lead(CX_G, G, "clint", { ext: "gA", status: "g_cr", em: meioDia(T0) });
  await lead(CX_G, G, "clint", { ext: "gB", status: "g_ag", em: meioDia(T1) });
  await lead(CX_G, G, "clint", { ext: "gC", status: "g_ag", em: meioDia(T2) });

  // ---------------------------------------------------------------- leituras (as mesmas antes e depois)
  const [DE, ATE] = [dataAtras(60), dataAtras(0)];
  const linhas = async (t: string, p: unknown[]) => (await q(t, p)).rows;
  const pessoasDe = async (c: string) => (await linhas("select id from pessoas where client_id = $1 order by id", [c])).map((r) => r.id);
  const pac = async (c: string, de: string, ate: string) => (await um("select public.pacientes_periodo_calc($1,$2::date,$3::date) r", [c, de, ate])).r as R;
  const leitores = async (c: string) => ({
    jornada: (await um("select public.jornada_resumo($1::uuid) r", [c])).r,
    base: (await um("select public.crm_base_viva($1) r", [c])).r,
    qualidade: (await um("select public.qualidade_leads_campanha($1,$2::date,$3::date) r", [c, DE, ATE])).r,
    relacionamento: await linhas("select * from public.relacionamento_pessoas($1,$2::uuid[]) order by pessoa_id", [c, await pessoasDe(c)]),
    sinais: (await um("select public.sap_sinais_auto($1,$2::date,$3::date) r", [c, DE, ATE])).r,
    marcar: await linhas("select * from public.sap_etapas_para_marcar($1) order by status_id", [c]),
    guia: (await um("select public.crm_guia_dados($1) r", [c])).r,
    etapas: await linhas("select * from public.crm_etapas_para_analise($1) order by connection_id, status_id", [c]),
    kpi: await linhas("select * from public.crm_etapas_kpi_para_analise($1) order by connection_id, status_id", [c]),
    ticket: (await um("select public.plano_ticket($1) r", [c])).r,
  });
  const regra = async (c: string) => ({
    cards: await linhas("select * from public.pacientes_cards($1) order by id", [c]),
    vendas: (await um("select public.crm_vendas_periodo($1,$2::date,$3::date) r", [c, DE, ATE])).r,
    perfil: await linhas("select * from public.crm_perfil_para_analise($1) order by connection_id, status_id", [c]),
    pacientes: await pac(c, dataAtras(30), dataAtras(1)),
  });
  const soma = (rs: R[], k: string) => rs.reduce((s, r) => s + Number(r[k]), 0);
  const definicoes = async () => Object.fromEntries((await linhas(`select f.fn, md5(pg_get_functiondef(f.fn::regprocedure)) m
      from unnest($1::text[]) f(fn)`, [FUNCOES])).map((r) => [r.fn, r.m]));
  const atributos = async () => linhas(`select p.oid::regprocedure::text fn, p.prosecdef, p.provolatile, p.proconfig, p.proacl::text acl, p.prorettype::regtype::text ret
      from pg_proc p where p.oid = any (select f::regprocedure from unnest($1::text[]) f) order by 1`, [FUNCOES]);
  const periodos = (): [string, string, string][] => [[D, DD, DD], [D, somar(DD, -5), somar(DD, 5)], [G, T0, T0], [G, T1, T1], [G, T2, T2],
    [G, T0, somar(T0, 29)], [G, T1, somar(T1, 29)], [C, dataAtras(1), dataAtras(1)], [C, dataAtras(30), dataAtras(1)]];

  const antes = {
    defs: await definicoes(), attrs: await atributos(),
    A: await leitores(A), B: await leitores(B), C: await leitores(C), FA: await leitores(FA), FB: await leitores(FB),
    regraC: await regra(C), relD: await linhas("select * from public.relacionamento_pessoas($1,$2::uuid[]) order by pessoa_id", [D, await pessoasDe(D)]),
    pac: await Promise.all(periodos().map(([c, de, ate]) => pac(c, de, ate))),
    cardsD: await linhas("select ext, em_comparecimento, em_agendamento from public.pacientes_cards($1) order by ext", [D]),
  };
  // Antes: na conta compartilhada, cada clínica via a conta inteira.
  assert.equal(antes.A.jornada.leads_total, 10);
  assert.equal(antes.B.jornada.leads_total, 10);
  assert.equal(soma(antes.FA.etapas, "total"), 10);
  // A conferência de velocidade roda antes e depois sem quebrar (pg_stat_statements simulado; os ids trocados).
  await q("create schema extensions");
  await q("create table extensions.pg_stat_statements(query text, calls bigint, total_exec_time float8, max_exec_time float8)");
  await q("create table extensions.pg_stat_statements_info(stats_reset timestamptz)");
  await q("insert into extensions.pg_stat_statements values ('select public.jornada_resumo(p_client := $1)', 4, 2000, 900), ('select public.jornada_resumo(p_client := $1, p_de := $2, p_ate := $3)', 9, 9000, 2000), ('select public.pacientes_periodo_calc($1,$2,$3)', 2, 12000, 7000)");
  const conferir = async () => {
    const r = await db.exec(auditoria.replaceAll(":'cliente_com_filtro'", `'${A}'`).replaceAll(":'cliente_sem_filtro'", `'${C}'`));
    return r.flatMap((x) => x.rows as R[]);
  };
  {
    const c0 = await conferir();
    const fn = c0.filter((l) => l.secao === "0-funcoes");
    assert.equal(fn.length, 14);
    assert.ok(fn.every((l) => l.existe === true && l.aplicada === false), "antes: nenhuma aplicada");
    const t = Object.fromEntries(c0.filter((l) => l.secao === "1-tempos").map((l) => [l.nome, l]));
    assert.equal(Number(t.jornada_resumo.chamadas), 4, "jornada_resumo sem período separado da com período");
    assert.equal(Number(t.jornada_resumo.media_ms), 500);
    assert.equal(Number(t.pacientes_periodo.chamadas), 0, "pacientes_periodo não conta pacientes_periodo_calc");
    const cf = c0.filter((l) => l.secao === "2-clinicas-com-filtro");
    assert.deepEqual(cf.map((l) => [l.client_id, Number(l.leads_conta), Number(l.leads_da_clinica)]),
      [[A, 10, 6], [B, 10, 4], [FA, 10, 6], [FB, 10, 4]]);
  }

  // ---------------------------------------------------------------- a migração (duas vezes) e as de depois
  await aplicar(MIGRACAO);
  const depoisDe1 = await definicoes();
  await aplicar(MIGRACAO);
  assert.deepEqual(await definicoes(), depoisDe1, "rodar de novo não muda nada");
  for (const f of arquivos.filter((f) => f > MIGRACAO)) await aplicar(f);
  for (const fn of FUNCOES) {
    assert.notEqual(depoisDe1[fn], antes.defs[fn], `${fn} trocada`);
    assert.ok((await um("select position($2 in pg_get_functiondef($1::regprocedure)) > 0 ok", [fn, MARCA])).ok, `${fn} com a marca`);
    const d = (await um("select pg_get_functiondef($1::regprocedure) d", [fn])).d as string;
    assert.ok(!d.includes("consulta realizada|p[oó]s[- ]?consulta)'") && !d.includes("(realizad|compareceu|atendid)"), `${fn} sem a regra antiga`);
    assert.ok(!d.includes("{RE_"), `${fn} sem marcador de substituição`);
  }
  assert.deepEqual(await atributos(), antes.attrs, "permissões, SECURITY DEFINER, search_path, volatilidade e retorno iguais");

  const depois = {
    A: await leitores(A), B: await leitores(B), C: await leitores(C), FA: await leitores(FA), FB: await leitores(FB),
    regraC: await regra(C), pac: await Promise.all(periodos().map(([c, de, ate]) => pac(c, de, ate))),
  };

  // ---------------------------------------------------------------- conta compartilhada: cada clínica só os seus
  const modelo = (x: boolean) => MODELO.filter((m) => m.x === x);
  for (const [nome, r, x] of [["A", depois.A, true], ["B", depois.B, false]] as const) {
    const ms = modelo(x);
    const ganhos = ms.filter((m) => m.outcome === "won");
    assert.equal(r.jornada.leads_total, ms.length, `${nome}: Jornada, total de leads`);
    assert.equal(r.jornada.leads_sem_pessoa, 0);
    assert.equal(r.jornada.viraram_lead, ms.length, `${nome}: Jornada, pessoas com lead`);
    assert.equal(r.jornada.ganhos, ganhos.length, `${nome}: Jornada, ganhos`);
    assert.equal(Number(r.jornada.receita), ganhos.reduce((s, m) => s + (m.price ?? 0), 0), `${nome}: Jornada, receita`);
    assert.equal(r.jornada.por_origem.reduce((s: number, o: R) => s + Number(o.leads), 0), ms.length, `${nome}: Jornada, por origem`);
    assert.equal(r.base.abertos, ms.filter((m) => m.outcome === "open").length, `${nome}: base viva`);
    assert.equal(r.qualidade.cobertura.leads_periodo, ms.length, `${nome}: qualidade dos leads`);
    assert.equal(r.relacionamento.filter((p: R) => p.ja_paciente).length,
      ms.filter((m) => m.outcome === "won" || m.status === "s_cr").length, `${nome}: relacionamento, já paciente`);
    assert.equal(r.relacionamento.length, 10, `${nome}: relacionamento devolve todas as pessoas pedidas`);
    assert.equal(r.sinais.confirmados, ms.filter((m) => m.status === "s_conf").length, `${nome}: SAP, confirmados`);
    assert.equal(r.sinais.perdidos_com_motivo, ms.filter((m) => m.motivo).length, `${nome}: SAP, perdidos com motivo`);
    assert.equal(soma(r.marcar, "total"), ms.length, `${nome}: SAP, etapas para marcar`);
    assert.equal(r.guia.leads, ms.length, `${nome}: guia, leads de 90 dias`);
    assert.equal(r.guia.ganhos, ganhos.length, `${nome}: guia, ganhos`);
    assert.equal(r.guia.abertos, ms.filter((m) => m.outcome === "open").length, `${nome}: guia, abertos`);
    assert.equal(soma(r.kpi, "total"), ms.length, `${nome}: papel do funil (KPI)`);
    assert.equal(r.etapas.length, 0, "crm_etapas_para_analise só lê FlwChat");
  }
  assert.equal(Number(depois.A.ticket), 300, "A: ticket = mediana dos 5 ganhos com o campo X");
  assert.equal(depois.B.ticket, null, "B: menos de 5 ganhos, sem ticket");
  assert.equal(Number(antes.A.ticket), 350, "antes: a mediana da conta inteira");
  assert.equal(soma(depois.FA.etapas, "total"), 6, "FA: papel do funil (FlwChat)");
  assert.equal(soma(depois.FB.etapas, "total"), 4, "FB: papel do funil (FlwChat)");
  // Os totais das duas clínicas fecham com a conta.
  assert.equal(depois.A.jornada.leads_total + depois.B.jornada.leads_total, antes.A.jornada.leads_total);

  // ---------------------------------------------------------------- clínica sem filtro: tudo igual
  assert.deepEqual(depois.C, antes.C, "C (sem filtro): os 10 leitores devolvem o mesmo");
  assert.deepEqual(depois.regraC, antes.regraC, "C (etapas que as duas regras leem igual): cards, vendas, perfil e Pacientes iguais");
  assert.ok(soma(antes.C.marcar, "total") > 0 && antes.C.etapas.length > 0 && antes.C.jornada.leads_total > 0, "C tem dado em cada leitor");
  assert.equal(antes.C.relacionamento.filter((p: R) => p.ja_paciente).length > 0, true);

  // ---------------------------------------------------------------- uma regra de comparecimento
  const cardsD = await linhas("select ext, em_comparecimento, em_agendamento from public.pacientes_cards($1) order by ext", [D]);
  assert.deepEqual(cardsD.map((r) => [r.ext, r.em_comparecimento]), [["d1", false], ["d2", true], ["d3", false], ["d4", false]],
    "Em acompanhamento conta; Contato realizado e No-show não");
  assert.deepEqual(antes.cardsD.map((r) => r.em_comparecimento), [false, false, false, false], "antes: nenhuma etapa reconhecida");
  const pD = (i: number) => depois.pac[i].numeros;
  assert.equal(pD(0).compareceram.valor, 1, "o card que entrou em Em acompanhamento no dia conta em Compareceram do dia");
  assert.equal(antes.pac[0].numeros.compareceram.valor, null, "antes: o CRM não tinha etapa reconhecida");
  assert.equal(depois.pac[0].listas.compareceram.total, 1);
  assert.equal(pD(1).compareceram.valor, 1, "no período de 11 dias, a mesma pessoa uma vez");
  // relacionamento_pessoas usava '(realizad|compareceu|atendid)': "Contato realizado" virava paciente.
  const relD = await linhas("select * from public.relacionamento_pessoas($1,$2::uuid[]) order by pessoa_id", [D, await pessoasDe(D)]);
  assert.deepEqual(antes.relD.map((r) => r.ja_paciente), [false, false, true, false], "antes: Contato realizado = já paciente");
  assert.deepEqual(relD.map((r) => r.ja_paciente), [false, true, false, false], "depois: só Em acompanhamento");
  // O literal no banco casa com a regra do guia em nomes reais (genéricos), dos dois lados.
  const NOMES = ["Compareceu", "4. Compareceu", "Compareceu à avaliação", "Consulta realizada", "Consulta Realizada (Automação)",
    "Atendido", "Em acompanhamento", "Pós procedimento", "Pos-procedimento", "Avaliação feita", "Procedimento realizado",
    "Contato realizado", "Abordagem realizada", "Reunião realizada", "Orçamento feito", "Proposta feita", "Oferta feita",
    "Realizando exames", "No-show", "Não compareceu", "Venda realizada", "Pós Venda", "Não atendido", "Reagendar consulta"];
  const reJs = new RegExp(esperado.comp, "i"), naoJs = new RegExp(esperado.nao, "i");
  const sqlRegra = await linhas(`select n, n ~* $2 and n !~* $3 as ok from unnest($1::text[]) with ordinality u(n, i) order by i`,
    [NOMES, esperado.comp, esperado.nao]);
  assert.deepEqual(sqlRegra.map((r) => r.ok), NOMES.map((n) => reJs.test(n) && !naoJs.test(n)), "SQL e guia dizem o mesmo");
  assert.deepEqual(sqlRegra.filter((r) => r.ok).map((r) => r.n), NOMES.slice(0, 11), "compareceu: só os 11 primeiros");

  // ---------------------------------------------------------------- trava de um dia por 30 dias
  const comp = (r: R) => r.numeros.compareceram;
  assert.equal(comp(antes.pac[3]).valor, null, "antes, T1: 1 agendamento e 0 comparecimento no dia viravam nulo");
  assert.equal(comp(antes.pac[3]).nao_medido_por, "etapa_sem_uso");
  assert.equal(comp(depois.pac[3]).valor, 0, "depois, T1: houve entrada em T0 (10 dias antes), o 0 do dia é medido");
  assert.equal(comp(depois.pac[3]).nao_medido_por, undefined);
  assert.equal(comp(depois.pac[4]).valor, null, "T2: nenhuma entrada em 30 dias, nulo como hoje");
  assert.equal(comp(depois.pac[4]).nao_medido_por, "etapa_sem_uso");
  assert.deepEqual(comp(depois.pac[4]), comp(antes.pac[4]));
  assert.equal(comp(depois.pac[2]).valor, 1, "T0: a entrada do dia");
  assert.deepEqual(comp(depois.pac[5]), comp(antes.pac[5]), "30 dias com a entrada: igual");
  assert.deepEqual(comp(depois.pac[6]), comp(antes.pac[6]), "30 dias sem entrada: a trava do período, igual");
  assert.equal(comp(depois.pac[6]).nao_medido_por, "etapa_sem_uso");
  // Os outros números de Pacientes não mudam (em D, Negociação muda de propósito: card em "Em acompanhamento" saiu da fila).
  const semComp = (r: R, fora: string[]) => Object.fromEntries(Object.entries(r.numeros).filter(([k]) => !fora.includes(k)));
  periodos().forEach(([c], i) => {
    const fora = c === D ? ["compareceram", "negociacao"] : ["compareceram"];
    assert.deepEqual(semComp(depois.pac[i], fora), semComp(antes.pac[i], fora), `Pacientes, período ${i}: os outros números iguais`);
  });
  assert.deepEqual(depois.pac[8], antes.pac[8], "C, 30 dias: Pacientes inteiro igual");
  assert.deepEqual(depois.pac[7], antes.pac[7], "C, um dia: Pacientes inteiro igual");

  // ---------------------------------------------------------------- conferência depois
  {
    const c1 = await conferir();
    assert.ok(c1.filter((l) => l.secao === "0-funcoes").every((l) => l.aplicada === true), "depois: as 14 aplicadas");
  }

  // ---------------------------------------------------------------- resultado pronto apagado
  await q("insert into resultado_pronto(client_id,funcao,de,ate,resultado) values ($1,'pacientes_periodo',$2,$3,'{}'),($1,'roi_periodo',$2,$3,'{}')", [C, DE, ATE]);

  // ---------------------------------------------------------------- reversão: o texto de antes volta exatamente
  await aplicarTexto("Reversão", reversao.replace(/^begin;$/m, "").replace(/^commit;$/m, ""));
  assert.deepEqual(await definicoes(), antes.defs, "md5 de cada função igual ao de antes da migração");
  assert.deepEqual(await atributos(), antes.attrs);
  assert.equal(Number((await um("select count(*) n from resultado_pronto where funcao = 'pacientes_periodo'")).n), 0, "reversão apaga o pronto de Pacientes");
  assert.equal(Number((await um("select count(*) n from resultado_pronto where funcao = 'roi_periodo'")).n), 1, "e só ele");
  await aplicarTexto("Reversão de novo", reversao.replace(/^begin;$/m, "").replace(/^commit;$/m, ""));
  assert.deepEqual(await definicoes(), antes.defs, "reverter de novo não muda nada");
  assert.deepEqual(await leitores(A), antes.A, "A volta a ver a conta inteira");

  // ---------------------------------------------------------------- trecho ausente: para tudo
  await db.exec("begin");
  await db.exec(`create or replace function public.plano_ticket(p_client uuid) returns numeric language sql stable security definer
    set search_path = public, pg_temp as $$ select 1::numeric $$`);
  await assert.rejects(db.exec(sql), /contagem-por-clinica.*plano_ticket.*trecho 1 aparece 0 vezes/s);
  await db.exec("rollback");
  assert.deepEqual(await definicoes(), antes.defs, "nada mudou: a transação inteira voltou");

  // De novo para frente (o estado final do banco de teste é o da migração aplicada).
  await aplicar(MIGRACAO);
  assert.deepEqual(await definicoes(), depoisDe1);
  assert.equal(Number((await um("select count(*) n from resultado_pronto where funcao = 'pacientes_periodo'")).n), 0);

  console.log("test-contagem-por-clinica: ok (conta compartilhada, 14 funções, regra única, trava de um dia, reversão)");
} finally {
  await db.close();
}
