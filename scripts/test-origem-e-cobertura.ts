import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migração 20261114100000 (origem e cobertura do CRM) em banco descartável, com dados inventados. Nunca conecta à
// produção. Aplica TODAS as migrações em ordem, esta duas vezes, e roda a conferência e o roteiro de refazer a origem.
const MIGRACAO = "20261114100000_origem_e_cobertura_do_crm.sql";
const db = new PGlite();
const U = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const K1 = U("11111111", 1), K2 = U("11111111", 2), A = U("11111111", 3), B = U("11111111", 4), C = U("11111111", 5);
const kx1 = U("22222222", 1), kx2 = U("22222222", 2), ca = U("22222222", 3), cb = U("22222222", 4), cc = U("22222222", 5);
const adm = U("33333333", 1), membro = U("33333333", 2);

type R = Record<string, any>;
try {
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
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO), "a migração existe");
  const textoMigracao = await readFile(new URL(MIGRACAO, pasta), "utf8");
  // Como o João aplica: o arquivo inteiro entre begin; e commit;.
  const aplicar = async (f: string) => {
    try { await db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`Migração ${f} falhou`, { cause: e }); }
  };
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await aplicar(f);

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
  const como = (sub: string) => q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub, role: "authenticated" })]);
  const negado = async (f: () => Promise<unknown>, code: string, msg: string) => {
    await assert.rejects(f, (e: any) => { assert.equal(e?.code, code, `${msg}: ${e?.message}`); return true; }, msg);
  };

  // ---------------------------------------------------------------- dados inventados
  for (const [id, n] of [[K1, "K1"], [K2, "K2"], [A, "A"], [B, "B"], [C, "C"]]) await q("insert into clients(id,name) values ($1,$2)", [id, `Clínica fictícia ${n}`]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test'),($2,'membro@example.test')", [adm, membro]);
  await q("insert into app_admins(user_id) values ($1)", [adm]);
  // Conta Kommo compartilhada: duas conexões, mesmo subdomínio, duas clínicas. Clint: uma conexão por clínica.
  await q(`insert into crm_connections(id,client_id,provider,subdomain,active,config) values
    ($1,$2,'kommo','conta-exemplo',true,'{}'),($3,$4,'kommo','conta-exemplo',true,'{}'),
    ($5,$6,'clint',null,true,'{}'),($7,$8,'clint',null,true,'{}'),($9,$10,'clint',null,true,'{}')`,
    [kx1, K1, kx2, K2, ca, A, cb, B, cc, C]);
  await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'pk1','Comercial','s1','Novo lead'),($1,'pk1','Comercial','sa','Consulta agendada'),($1,'pk1','Comercial','sc','Consulta realizada'),
    ($1,'pk1','Comercial','sw','Venda ganha'),($1,'pk-outro','Outro médico','so','Outro'),
    ($2,'pk1','Comercial','s1','Novo lead'),($2,'pk1','Comercial','sp','Compareceu'),
    ($3,'p9','Funil Instagram','n1','Novo contato'),($3,'p9','Funil Instagram','n2','Consulta agendada'),($3,'p8','Funil Geral','n1','Novo contato'),
    ($4,'p1','Comercial','n1','Novo contato'),($5,'p1','Comercial','n1','Novo contato'),($5,'p1','Comercial','vr','Venda realizada')`,
    [kx1, kx2, ca, cb, cc]);
  // A clínica K1 vê só o funil pk1 da conta compartilhada.
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,valor,modo) values ($1,$2,'pipeline','pk1','incluir')", [K1, kx1]);

  const lead = (cx: string, cli: string, prov: string, ext: string, o: { pipe?: string; st?: string; canal?: string | null; source?: string | null; raw?: unknown; outcome?: string; price?: number; dias?: number } = {}) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,canal_id,source)
       values ($1,$2,$3,$4,'sync',$5,$6,$7,$8,$9,now() - make_interval(days => $10),$11,$12)`,
      [cx, cli, prov, ext, JSON.stringify(o.raw ?? {}), o.pipe ?? "pk1", o.st ?? "s1", o.outcome ?? "open", o.price ?? null, o.dias ?? 5, o.canal ?? null, o.source ?? null]);
  // Kommo: três leads no canal c9 sem origem (dois na conexão 1, um na 2).
  await lead(kx1, K1, "kommo", "L1", { canal: "c9" });
  await lead(kx1, K1, "kommo", "L2", { canal: "c9" });
  await lead(kx2, K2, "kommo", "M1", { canal: "c9" });
  await lead(kx1, K1, "kommo", "L3", { canal: "c9", source: "Google" });           // origem do CRM
  await lead(kx1, K1, "kommo", "L4", { canal: "c9" });                             // vira origem da mensagem abaixo
  await q("update crm_leads set source = 'Instagram', origem_como = 'mensagem' where external_lead_id = 'L4'");
  await lead(kx1, K1, "kommo", "L5", { canal: "c7", pipe: "pk-outro", st: "so" });  // outro médico: fora do recorte de K1
  await lead(kx1, K1, "kommo", "L6", { canal: "c5" });                             // canal sem tradução
  await lead(kx1, K1, "kommo", "L7", { st: "sw", outcome: "won", price: 500, source: "Indicação" });
  await lead(kx1, K1, "kommo", "L8", { st: "sw", outcome: "won", price: 0, source: "Indicação" });
  // K2: 2100 leads com o rastreio do Meta (o roteiro preenche em dois lotes) e 50 sem nada.
  const metaAd = JSON.stringify({ custom_fields_values: [{ field_code: "META_AD_ID", field_name: "Meta Ads", values: [{ value: "123" }] }] });
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at)
    select $1,$2,'kommo','R'||g,'sync',$3::jsonb,'pk1','s1','open',now() - interval '40 days' from generate_series(1,2100) g`, [kx2, K2, metaAd]);
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at)
    select $1,$2,'kommo','N'||g,'sync','{}','pk1','s1','open',now() - interval '40 days' from generate_series(1,50) g`, [kx2, K2]);
  // Clint (A): funil p9 sem origem, funil p8 sem origem, e leads que a conversa vai preencher.
  await lead(ca, A, "clint", "F1", { pipe: "p9", st: "n1" });
  await lead(ca, A, "clint", "F2", { pipe: "p8", st: "n1" });
  await lead(ca, A, "clint", "G1", { pipe: "p8", st: "n1", raw: { fields: { checkout_app: "x" } } });
  await lead(ca, A, "clint", "AD1", { pipe: "p8", st: "n1" });
  await lead(ca, A, "clint", "MS1", { pipe: "p8", st: "n1" });
  await lead(cb, B, "clint", "B1", { pipe: "p1", st: "n1", outcome: "won", dias: 100 });
  await lead(cc, C, "clint", "C1", { pipe: "p1", st: "n1" });
  // Antes da migração, o META_AD_ID não vira origem.
  assert.equal((await um("select count(*) n from crm_leads where client_id = $1 and source is null", [K2])).n, 2151);

  // Conversas: AD1 veio de anúncio; MS1 veio de anúncio e começa com a mensagem pronta do Instagram.
  const leadId = async (ext: string) => (await um("select id from crm_leads where external_lead_id = $1", [ext])).id;
  for (const [n, ext] of [[1, "AD1"], [2, "MS1"]] as const) {
    const cv = U("44444444", n);
    await q("insert into conversas(id,client_id,lead_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,'clint','whatsapp',$4,now()-interval '5 days',now()-interval '5 days')",
      [cv, A, await leadId(ext), `chat-${n}`]);
    await q("insert into conversas_origem_anuncio(conversa_id,client_id,ad_id) values ($1,$2,'ad-1')", [cv, A]);
    await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada',$3,'texto',now()-interval '5 days',$4)",
      [cv, A, n === 2 ? "Olá, vim do Instagram e quero agendar" : "quanto custa?", `m-${n}`]);
  }
  // Entrada numa etapa de comparecimento de K1 em 30 dias.
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_de,status_de,pipeline_para,status_para,ocorreu_em)
    values ($1,$2,'L3','mudou_etapa','pk1','s1','pk1','sc',now() - interval '3 days')`, [K1, kx1]);
  await q("insert into crm_canais_origem(crm_connection_id,canal_id,canal_nome,origem,conclusivo) values ($1,'c-antigo','Canal antigo','Instagram',true)", [kx1]);

  // ---------------------------------------------------------------- 30 cargas para comparar a leitura antiga e a nova
  const antiga = (await um("select pg_get_functiondef('public.crm_origem_inferida(text,jsonb)'::regprocedure) d")).d as string;
  await db.exec(antiga.replace("public.crm_origem_inferida(", "public.crm_origem_inferida_antiga("));
  const cf = (campos: [string, string, string][]) => ({ custom_fields_values: campos.map(([code, name, value]) => ({ field_code: code || undefined, field_name: name, values: [{ value }] })) });
  const casos: [string, unknown][] = [
    ["kommo", cf([["UTM_SOURCE", "utm_source", "facebook"]])],
    ["kommo", cf([["UTM_SOURCE", "utm_source", "parceiro-x"]])],
    ["kommo", cf([["", "Origem", "Indicação de paciente"]])],
    ["kommo", cf([["", "Fonte", "Evento da clínica"]])],
    ["kommo", cf([["", "Como conheceu", "google"]])],
    ["kommo", cf([["", "Origem", ""], ["", "MÉDICO", "Dr. Fictício"]])],
    ["kommo", { _embedded: { tags: [{ name: "Origem · Instagram" }] } }],
    ["kommo", { _embedded: { tags: [{ name: "instagram" }] } }],
    ["kommo", { _embedded: { tags: [{ name: "Nexo | Origem não documentada" }] } }],
    ["kommo", { custom_fields_values: [] }],
    ["kommo", { ...cf([["META_AD_ID", "Meta Ads", "123"], ["UTM_SOURCE", "utm_source", "google"]]) }],
    ["kommo", { ...cf([["META_AD_ID", "Meta Ads", "123"]]), _embedded: { tags: [{ name: "Indicação" }] } }],
    ["clint", { fields: { fonte: "Instagram|x" } }],
    ["clint", { fields: { origem: "Site institucional" } }],
    ["clint", { fields: { utm_source: "tiktok" } }],
    ["clint", { fields: { parameters_utm_source: "parceiro" } }],
    ["clint", { fields: { formulario_facebook: "sim" } }],
    ["clint", { fields: { ad_id: "1" } }],
    ["clint", { fields: { form_id: "2" } }],
    ["clint", { fields: {}, contato_tags: ["ig-social"] }],
    ["clint", { fields: { fonte: "Indicação", id_do_anuncio: "x" } }],
    ["clint", { fields: { link_do_anuncio: "https://example.test" }, contato_tags: ["site_doctor"] }],
    ["rdstation", { deal_source: { name: "Google Ads" } }],
    ["rdstation", { deal_source: { name: "" } }],
    ["flwchat", { contato_tags: ["Origem · Indicação"] }],
    ["flwchat", { contato_tags: ["Tipo · Paciente"] }],
    ["digisac", { etiquetas: [{ name: "Origem-Google" }] }],
    ["digisac", { etiquetas: ["indicação"] }],
    ["kommo", null],
    ["kommo", []],
  ];
  assert.equal(casos.length, 30, "30 casos");
  const lerAntiga = async (p: string, r: unknown) => um("select o.origem, o.como from public.crm_origem_inferida_antiga($1,$2::jsonb) o", [p, r === null ? null : JSON.stringify(r)]);
  const ler = async (p: string, r: unknown) => um("select o.origem, o.como from public.crm_origem_inferida($1,$2::jsonb) o", [p, r === null ? null : JSON.stringify(r)]);
  const antes30 = await Promise.all(casos.map(([p, r]) => lerAntiga(p, r)));

  // ---------------------------------------------------------------- conferência ANTES (só leitura)
  const conferencia = await readFile(new URL("../supabase/audits/dados-do-crm-conferencia.sql", import.meta.url), "utf8");
  const semComentario = conferencia.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  assert.equal((semComentario.match(/\b(insert|update|delete|alter|create|drop)\b/gi) ?? []).length, 0, "conferência sem escrita");
  assert.match(conferencia, /read only/);
  const consultas = conferencia.split(/^-- \[\d\]/m).slice(1).map((c) => c.replace(/^[^\n]*\n/, ""));
  assert.equal(consultas.length, 3, "três consultas");
  const conferir = async () => Promise.all(consultas.map(async (c) => (await q(c)).rows));
  {
    const [pre, porClinica, vel] = await conferir();
    assert.deepEqual(pre.slice(0, 4).map((r) => r.situacao), ["corpo esperado", "corpo esperado", "corpo esperado", "1 vez(es)"], "antes: corpos esperados e trecho uma vez");
    assert.ok(pre.slice(4).every((r) => r.situacao === "não"));
    assert.equal(porClinica.find((r) => r.client_id === K2)!.sem_origem_30d, 1, "K2: só M1 em 30 dias (os outros têm 40)");
    assert.equal(porClinica.find((r) => r.client_id === K1)!.leads_30d, 7, "recorte de K1: sem o outro médico");
    assert.equal(porClinica.find((r) => r.client_id === K1)!.canais_kommo_lidos, null, "tabela ainda não existe");
    assert.equal(vel.length, 6);
  }

  // Pacientes antes: Fecharam 0 medido nas três clínicas Clint.
  const dia = (await um("select ((now() at time zone 'America/Sao_Paulo')::date - 2) d")).d;
  const fecharam = async (cli: string) => { await como(adm); return (await um("select public.pacientes_periodo_calc($1,$2,$2) r", [cli, dia])).r.numeros.fecharam as R; };
  for (const cli of [A, B, C]) assert.equal((await fecharam(cli)).valor, 0, "antes: 0 medido");

  // ---------------------------------------------------------------- a migração, duas vezes
  await aplicar(MIGRACAO);
  for (const f of arquivos.filter((f) => f > MIGRACAO)) await aplicar(f);
  const foto = async () => JSON.stringify((await q(`select p.proname, md5(pg_get_functiondef(p.oid)) m from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`)).rows)
    + JSON.stringify((await q("select * from crm_canais_origem order by 1, 2")).rows)
    + JSON.stringify((await q("select count(*) n, count(source) s from crm_leads")).rows);
  const f1 = await foto();
  await aplicar(MIGRACAO);
  assert.equal(await foto(), f1, "segunda aplicação não muda nada");
  assert.equal((textoMigracao.match(/is_app_admin\(\)/g) ?? []).length >= 3, true, "guarda de admin");
  assert.equal(textoMigracao.includes("set_config('request.jwt.claims'"), false, "sem troca de claims na migração");

  // A trava: função com corpo diferente faz a migração inteira parar sem mudar nada.
  {
    const atual = (await um("select pg_get_functiondef('public.crm_aplicar_origem_externa(uuid)'::regprocedure) d")).d as string;
    await db.exec(atual.replace("[dados-do-crm]", "[mexida-a-mao]"));
    const fAntes = await foto();
    await assert.rejects(aplicar(MIGRACAO), (e: any) => /mudou desde a leitura/.test(String(e?.cause?.message)), "trava de md5");
    assert.equal(await foto(), fAntes, "nada mudou");
    await db.exec(atual);
  }

  // ---------------------------------------------------------------- crm_origem_inferida: antiga x nova
  const depois30 = await Promise.all(casos.map(([p, r]) => ler(p, r)));
  assert.deepEqual(depois30, antes30, "os 30 casos antigos dão o mesmo resultado");
  assert.deepEqual(await ler("kommo", cf([["META_AD_ID", "Meta Ads", "123"]])), { origem: "Anúncio", como: "utm" });
  assert.deepEqual(await ler("kommo", cf([["META_AD_ID", "Meta Ads", ""]])), await lerAntiga("kommo", cf([["META_AD_ID", "Meta Ads", ""]])), "sem valor: como antes");
  assert.deepEqual(await ler("clint", { fields: { id_do_anuncio: "x" } }), { origem: "Anúncio", como: "formulario" });
  assert.deepEqual(await ler("clint", { fields: { link_do_anuncio: "https://example.test" } }), { origem: "Anúncio", como: "formulario" });
  assert.deepEqual(await ler("clint", { fields: { fonte: "Indicação", id_do_anuncio: "x" } }), { origem: "Indicação", como: "campo" }, "fonte continua primeiro");
  assert.deepEqual(await ler("flwchat", { card_tags: ["Indicação"] }), { origem: "Indicação", como: "etiqueta" });
  assert.deepEqual(await ler("flwchat", { contato_tags: ["Tipo · Paciente"], card_tags: ["Origem · Google"] }), { origem: "Google", como: "etiqueta" });

  // ---------------------------------------------------------------- confirmar um canal (rpc + gatilho)
  const origemDe = async (ext: string) => um("select source, origem_como from crm_leads where external_lead_id = $1", [ext]);
  await como(adm);
  assert.equal((await um("select public.crm_definir_canal_origem($1,'c9','Canal X','Instagram',true) n", [kx1])).n, 3, "três leads das duas conexões");
  for (const ext of ["L1", "L2", "M1"]) assert.deepEqual(await origemDe(ext), { source: "Instagram", origem_como: "canal" });
  assert.deepEqual(await origemDe("L3"), { source: "Google", origem_como: "crm" }, "origem do CRM não é tocada");
  assert.deepEqual(await origemDe("L4"), { source: "Instagram", origem_como: "mensagem" }, "origem da mensagem não é tocada");
  assert.deepEqual((await q("select crm_connection_id, canal_nome, origem, conclusivo from crm_canais_origem where canal_id = 'c9' order by 1")).rows,
    [kx1, kx2].map((cx) => ({ crm_connection_id: cx, canal_nome: "Canal X", origem: "Instagram", conclusivo: true })), "as duas conexões da conta");
  // Tirar a tradução volta os leads para sem origem.
  assert.equal((await um("select public.crm_definir_canal_origem($1,'c9',null,null,null) n", [kx2])).n, 3);
  for (const ext of ["L1", "L2", "M1"]) assert.deepEqual(await origemDe(ext), { source: null, origem_como: null });
  assert.equal((await um("select count(*) n from crm_canais_origem where canal_id = 'c9'")).n, 0);
  // Genérico: guardado não conclusivo, não preenche.
  await q("select public.crm_definir_canal_origem($1,'c9','Canal X','Genérico (não diz a origem)',false)", [kx1]);
  assert.deepEqual((await q("select distinct origem, conclusivo from crm_canais_origem where canal_id = 'c9'")).rows, [{ origem: "Genérico (não diz a origem)", conclusivo: false }]);
  assert.deepEqual(await origemDe("L1"), { source: null, origem_como: null });
  // Fora da lista e quem não é da equipe.
  await negado(() => q("select public.crm_definir_canal_origem($1,'c9','Canal X','Panfleto',true)", [kx1]), "22023", "origem fora da lista");
  await como(membro);
  await negado(() => q("select public.crm_definir_canal_origem($1,'c9','Canal X','Instagram',true)", [kx1]), "42501", "não admin");
  await negado(() => q("select public.crm_cobertura($1)", [K1]), "42501", "cobertura: não admin");
  await negado(() => q("select * from public.crm_canais_para_confirmar($1)", [K1]), "42501", "canais: não admin");
  for (const fn of ["crm_definir_canal_origem(uuid,text,text,text,boolean)", "crm_cobertura(uuid)", "crm_canais_para_confirmar(uuid)"]) {
    const r = await um(`select has_function_privilege('anon','public.${fn}','EXECUTE') a, has_function_privilege('authenticated','public.${fn}','EXECUTE') u`);
    assert.deepEqual(r, { a: false, u: true }, fn);
  }
  assert.deepEqual(await um(`select has_table_privilege('anon','public.crm_canais_kommo','SELECT') a, has_table_privilege('authenticated','public.crm_canais_kommo','INSERT') i,
    (select relrowsecurity from pg_class where oid = 'public.crm_canais_kommo'::regclass) rls`), { a: false, i: false, rls: true });
  await como(adm);
  await q("select public.crm_definir_canal_origem($1,'c9','Canal X','Instagram',true)", [kx1]);

  // ---------------------------------------------------------------- funil da Clint e anúncio da conversa
  assert.deepEqual(await origemDe("F1"), { source: null, origem_como: null });
  assert.equal((await um("select public.crm_definir_canal_origem($1,'funil:p9','Funil Instagram','Instagram',true) n", [ca])).n, 1);
  assert.deepEqual(await origemDe("F1"), { source: "Instagram", origem_como: "funil" });
  assert.deepEqual(await origemDe("F2"), { source: null, origem_como: null }, "outro funil não muda");
  await lead(ca, A, "clint", "F3", { pipe: "p9", st: "n1", raw: { fields: { id_do_anuncio: "x" } } });
  assert.deepEqual(await origemDe("F3"), { source: "Anúncio", origem_como: "formulario" }, "a leitura do lead vem antes do funil");
  await lead(ca, A, "clint", "F4", { pipe: "p9", st: "n1" });
  assert.deepEqual(await origemDe("F4"), { source: "Instagram", origem_como: "funil" }, "lead novo do funil confirmado");

  assert.equal((await um("select public.crm_aplicar_origem_externa($1) n", [A])).n, 2);
  assert.deepEqual(await origemDe("AD1"), { source: "Anúncio", origem_como: "anuncio" });
  assert.deepEqual(await origemDe("MS1"), { source: "Instagram", origem_como: "mensagem" }, "a mensagem vem primeiro");
  await q("update crm_leads set raw_payload = raw_payload || '{\"x\":1}' where external_lead_id = 'AD1'");
  assert.deepEqual(await origemDe("AD1"), { source: "Anúncio", origem_como: "anuncio" }, "o sync regrava e a origem do anúncio fica");

  // ---------------------------------------------------------------- telas da equipe
  await q("insert into crm_canais_kommo(crm_connection_id,canal_id,nome,tipo) values ($1,'c5','Instagram Direct','instagram'),($1,'c9','Canal X',null)", [kx1]);
  const canais = (await q("select * from public.crm_canais_para_confirmar($1)", [K1])).rows;
  assert.deepEqual(canais.map((r) => r.canal_id).sort(), ["c5", "c9"], "c7 é do outro médico (filtro)");
  assert.deepEqual(canais.find((r) => r.canal_id === "c5"),
    { crm_connection_id: kx1, tipo: "canal", canal_id: "c5", nome: "Instagram Direct", leads_90d: 1, sem_origem_90d: 1, origem_atual: null, conclusivo: null, sugestao: "Instagram" });
  assert.deepEqual(canais.find((r) => r.canal_id === "c9"),
    { crm_connection_id: kx1, tipo: "canal", canal_id: "c9", nome: "Canal X", leads_90d: 4, sem_origem_90d: 0, origem_atual: "Instagram", conclusivo: true, sugestao: null });
  const funis = (await q("select * from public.crm_canais_para_confirmar($1)", [A])).rows;
  assert.deepEqual(funis.map((r) => [r.tipo, r.canal_id, r.nome, r.sem_origem_90d, r.sugestao]),
    [["funil", "funil:p8", "Funil Geral", 2, null], ["funil", "funil:p9", "Funil Instagram", 0, "Instagram"]]);

  const cob = (await um("select public.crm_cobertura($1) c", [K1])).c as R;
  assert.deepEqual(Object.keys(cob).sort(), ["compareceu", "etapas", "origem", "tem_crm", "valor"]);
  assert.deepEqual(cob, {
    origem: { leads: 7, com_origem: 6, por_como: { canal: 2, crm: 3, mensagem: 1 }, sem_traducao: 1, checkout: 0 },
    valor: { ganhos: 2, com_valor: 1 },
    etapas: { com_card: 2, com_papel: 1 },
    compareceu: { estado: "medido", etapas: 1, entradas_30d: 1 },
    tem_crm: true,
  });
  const cobK2 = (await um("select public.crm_cobertura($1) c", [K2])).c as R;
  assert.equal(cobK2.compareceu.estado, "sem_uso");
  const cobA = (await um("select public.crm_cobertura($1) c", [A])).c as R;
  assert.equal(cobA.compareceu.estado, "sem_etapa");
  assert.deepEqual(cobA.origem, { leads: 7, com_origem: 5, por_como: { anuncio: 1, formulario: 1, funil: 2, mensagem: 1 }, sem_traducao: 1, checkout: 1 }, "F2 sem tradução; G1 criado pela compra");
  assert.equal(((await um("select public.crm_cobertura($1) c", [U("99999999", 1)])).c as R).tem_crm, false);

  // ---------------------------------------------------------------- Fecharam "não se aplica" (adendo)
  const fa = await fecharam(A);
  assert.deepEqual(fa, { valor: null, fonte: "crm_e_conversa", motivo_sem_dado: "o CRM não marca venda", responsavel: "comercial", nao_se_aplica: true }, "sem etapa de venda e sem ganho: não se aplica");
  assert.equal((await fecharam(B)).valor, 0, "com ganho nos 180 dias: 0 medido");
  assert.equal((await fecharam(C)).valor, 0, "com etapa de venda: 0 medido");
  await q("insert into crm_etapa_resultado(crm_connection_id,pipeline_id,status_id,outcome) values ($1,'p8','n1','won')", [ca]);
  assert.equal((await fecharam(A)).valor, 0, "etapa marcada como ganho pela equipe: 0 medido");
  await q("delete from crm_etapa_resultado where crm_connection_id = $1", [ca]);

  // ---------------------------------------------------------------- roteiro de refazer a origem (K2, dois lotes)
  const roteiro = await readFile(new URL("../supabase/operacoes/20261114-refazer-origem-dos-leads.sql", import.meta.url), "utf8");
  const lote = roteiro.match(/^update public\.crm_leads[\s\S]*?;$/m)![0].replace("COLE-AQUI-O-ID-DA-CONEXAO", kx2);
  const selectAntes = roteiro.split("-- (a) ANTES")[1].split("\n").slice(1).join("\n").split(";")[0];
  const antesK2 = (await q(selectAntes)).rows.find((r) => r.crm_connection_id === kx2)!;
  assert.deepEqual([Number(antesK2.sem_origem), Number(antesK2.vai_preencher)], [2150, 2100]);
  const lotes: number[] = [];
  for (let i = 0; i < 5; i++) { const r = await db.query(lote); lotes.push(r.affectedRows ?? 0); if (!r.affectedRows) break; }
  assert.deepEqual(lotes, [2000, 100, 0], "dois lotes e depois UPDATE 0");
  assert.equal((await um("select count(*) n from crm_leads where client_id = $1 and source = 'Anúncio' and origem_como = 'utm'", [K2])).n, 2100);
  assert.equal((await um("select count(*) n from crm_leads where client_id = $1 and source is null and external_lead_id like 'N%'", [K2])).n, 50, "sem nada continua nulo");
  assert.equal((await db.query(lote)).affectedRows, 0, "rodar de novo: UPDATE 0");
  const depoisK2 = (await q(selectAntes)).rows.find((r) => r.crm_connection_id === kx2)!;
  assert.deepEqual([Number(depoisK2.sem_origem), Number(depoisK2.vai_preencher)], [50, 0]);

  // ---------------------------------------------------------------- conferência DEPOIS
  {
    const [pre, porClinica] = await conferir();
    assert.deepEqual(pre.map((r) => r.situacao), ["já aplicada", "já aplicada", "já aplicada", "já aplicada", "sim", "sim", "sim", "sim"]);
    assert.equal(porClinica.find((r) => r.client_id === K1)!.canais_kommo_lidos, 2);
    assert.equal(porClinica.find((r) => r.client_id === K1)!.por_canal, 2);
  }
  console.log("test-origem-e-cobertura: ok (canal e funil confirmados, 30 casos iguais, cobertura, Fecharam não se aplica, roteiro em 2 lotes)");
} finally { await db.close(); }
