import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Banco descartável; usa roles de verdade, RLS e o formato de JWT do Supabase.
// Não lê .env e nunca se conecta ao banco de produção.
const db = new PGlite();
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const apply = async (file: string) => {
  try { await db.exec(`begin;\n${await readFile(new URL(file, dir), "utf8")}\ncommit;`); }
  catch (cause) { throw new Error(`Migração ${file} falhou`, { cause }); }
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), editor = id(3), viewer = id(4), outsider = id(5), admin = id(6);
const accountA = id(10), accountB = id(11), postA = id(20), postB = id(21);
const connectionA = id(30), connectionB = id(31), personA = id(40), personB = id(41);
const conversationA = id(50), conversationB = id(51), leadA = id(60), leadB = id(61);
const linkA = id(70), linkB = id(71), executionA = id(80), executionB = id(81);
const clinicA = id(90), clinicB = id(91), approvalA = id(100), suggestion = id(110);
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  try { await run(); checks++; }
  catch (cause) { throw new Error(name, { cause }); }
}
async function role<T>(name: "anon" | "authenticated" | "service_role", user: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: name, ...(user ? { sub: user } : {}) })]);
    await db.exec(`set local role ${name}`);
    return await run();
  } finally { await db.exec("rollback"); }
}
const rows = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
const execRows = async <T = Record<string, unknown>>(sql: string) => (await db.exec(sql)).flatMap((result) => result.rows as T[]);
const denied = (run: () => Promise<unknown>, code = "42501") => assert.rejects(run, (err: unknown) => !!err && typeof err === "object" && "code" in err && err.code === code);
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  await db.exec("set time zone 'America/Sao_Paulo'");
  const legacy = files.filter((f) => f < "20261022120000");
  const hardening = files.filter((f) => f >= "20261022120000");
  assert.ok(hardening.length >= 4, "migrações de segurança devem estar presentes");
  for (const file of legacy) await apply(file);
  const operationalSignatures = await rows<{ signature: string; definition: string }>(
    `select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc
     where pronamespace='public'::regnamespace and prosecdef and proconfig @> array['search_path=""'] order by 1`);
  assert.equal(operationalSignatures.length,16,"RPCs da PR169 devem ser exercitadas sem substituição");
  // Reproduz explicitamente uma view legada; o default atual já usa invoker.
  await db.exec("alter view public.meta_ads_daily_v set (security_invoker=false)");
  for (const user of [editor, viewer, outsider, admin]) await db.query("insert into auth.users(id,email) values ($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into app_admins(user_id) values ($1)", [admin]);
  for (const [client, account, post, connection, person, conversation, lead, link, execution, clinic] of [
    [A, accountA, postA, connectionA, personA, conversationA, leadA, linkA, executionA, clinicA],
    [B, accountB, postB, connectionB, personB, conversationB, leadB, linkB, executionB, clinicB],
  ]) {
    await db.query("insert into clients(id,name,wts_api_token,digisac_token) values ($1,$2,'fake-wts','fake-digisac')", [client, client === A ? "Clínica A" : "Clínica B"]);
    await db.query("insert into instagram_accounts(id,client_id,windsor_account_id) values ($1::uuid,$2,$1::uuid::text)", [account, client]);
    await db.query("insert into instagram_posts(id,client_id,instagram_account_id,windsor_media_id,reach,caption) values ($1::uuid,$2,$3,$1::uuid::text,100,'Legenda pública')", [post, client, account]);
    await db.query("insert into crm_connections(id,client_id,provider,access_token,webhook_secret) values ($1,$2,'kommo','fake-token','fake-secret')", [connection, client]);
    await db.query("insert into pessoas(id,client_id,nome,telefone,email) values ($1,$2,$3,'+55 85 99999-1234','fixture@example.test')", [person, client, client === A ? "Pessoa A" : "Pessoa B"]);
    await db.query("insert into crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,raw_payload,pessoa_id,occurred_at) values ($1,$2,$3,'kommo','fixture','add','won',500,'{}',$4,now())", [lead, client, connection, person]);
    await db.query("insert into conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,'wts','fixture',now(),now())", [conversation, client, person]);
    await db.query("insert into mensagens(conversa_id,client_id,direcao,texto,enviada_em,externo_id) values ($1,$2,'entrada',$3,now(),'fixture')", [conversation, client, client === A ? "Mensagem A" : "Mensagem B"]);
    await db.query("insert into links_rastreados(id,client_id,codigo_ref,tipo,destino_url) values ($1::uuid,$2,$1::uuid::text,'bio','https://example.test')", [link, client]);
    await db.query("insert into agente_execucoes(id,client_id,agente,fluxo,objetivo) values ($1,$2,'fixture','fixture','fixture')", [execution, client]);
    await db.query("insert into sap_clinicas(id,client_id,nome) values ($1,$2,'Fixture')", [clinic, client]);
    await db.query("insert into meta_ads_campaigns(client_id,ad_account_id,campaign_id,name) values ($1,'act-fixture','fixture','Campanha')", [client]);
    await db.query("insert into meta_ads_daily(client_id,ad_account_id,campaign_id,date,spend) values ($1,'act-fixture','fixture',current_date,10)", [client]);
    await db.query("insert into cliente_modulos(client_id,modulo,status) values ($1,'brand_brain','beta')", [client]);
  }
  await db.query("insert into client_members(client_id,user_id,role) values ($1,$2,'strategist'),($1,$3,'viewer'),($4,$2,'strategist')", [A, editor, viewer, B]);
  await db.query("insert into content_angle_suggestions(id,client_id,rationale) values ($1,$2,'Fixture')", [suggestion, A]);
  await db.query("insert into aprovacoes(id,execucao_id,client_id,passo,risco,resumo,proposta,estado,decidido_por) values ($1,$2,$3,'aprovar_marco','medio','Fixture',$4,'aprovada',$5)", [approvalA, executionA, A, { marco: 5, evidencia: "Evidência aprovada pela equipe" }, admin]);
  // Duas interações da mesma pessoa não duplicam seus R$ 500 de receita.
  for (const external of ["fixture-1", "fixture-2"]) await db.query("insert into toques(client_id,pessoa_id,tipo,instagram_post_id,link_id,ocorreu_em,fonte,externo_id) values ($1,$2,'comentario',$3,$4,now(),'instagram',$5)", [A, personA, postA, linkA, external]);
  // Relação legada inconsistente: a migração não deve apagar dados e a RPC não
  // deve revelar uma mensagem de outro tenant até a validação da FK terminar.
  await db.query("insert into mensagens(conversa_id,client_id,direcao,texto,enviada_em,externo_id) values ($1,$2,'entrada','MENSAGEM DE OUTRO TENANT',now(),'legacy-mismatch')", [conversationA, B]);

  await check("reprodução da view que ignorava RLS", async () => {
    assert.equal((await role("anon", null, () => rows("select * from meta_ads_daily_v"))).length, 2);
  });
  await check("reprodução da alteração indevida de métricas", async () => {
    await role("authenticated", viewer, async () => {
      assert.equal((await rows("update instagram_posts set reach=999 where id=$1 returning id", [postA])).length, 1);
    });
  });
  await check("reprodução de sombreamento por tabela temporária", async () => {
    await role("authenticated", admin, async () => {
      await db.exec("create temp table crm_connections(client_id uuid,provider text,active boolean,created_at timestamptz) on commit drop");
      await db.query("insert into pg_temp.crm_connections values ($1,'hijacked',true,now())", [A]);
      assert.deepEqual(await rows("select crm_provider($1) as provider", [A]), [{ provider: "hijacked" }]);
    });
  });
  for (const file of hardening) await apply(file);

  await check("hardening preserva exatamente as 16 RPCs operacionais da PR169", async () => {
    assert.deepEqual(await rows(`select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc
      where pronamespace='public'::regnamespace and oid::regprocedure::text=any($1) order by 1`,[operationalSignatures.map(r=>r.signature)]),operationalSignatures);
  });
  await check("todas as tabelas têm RLS", async () => {
    assert.deepEqual(await rows("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity"), []);
  });
  await check("views respeitam o usuário invocador", async () => {
    assert.deepEqual(await rows("select relname from pg_class where relnamespace='public'::regnamespace and relkind='v' and not coalesce(reloptions @> array['security_invoker=true'],false)"), []);
  });
  await check("nenhuma tabela/RPC está acessível a anon", async () => {
    assert.deepEqual(await rows("select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')"), []);
    assert.deepEqual(await rows("select oid::regprocedure::text from pg_proc where pronamespace='public'::regnamespace and has_function_privilege('anon',oid,'EXECUTE')"), []);
  });
  await check("SECURITY DEFINER não resolve tabelas temporárias antes do schema confiável", async () => {
    assert.deepEqual(await rows(`select proname from pg_proc where pronamespace='public'::regnamespace and prosecdef and not coalesce(proconfig @> array['search_path=public, pg_temp'] or proconfig @> array['search_path=""'],false)`), []);
  });
  await check("tabela temporária não altera o resultado de SECURITY DEFINER", async () => {
    await role("authenticated", admin, async () => {
      await db.exec("create temp table crm_connections(client_id uuid,provider text,active boolean,created_at timestamptz) on commit drop");
      await db.query("insert into pg_temp.crm_connections values ($1,'hijacked',true,now())", [A]);
      assert.deepEqual(await rows("select crm_provider($1) as provider", [A]), [{ provider: "kommo" }]);
    });
  });
  await check("authenticated não tem TRUNCATE nem CREATE no schema", async () => {
    assert.deepEqual(await rows("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege('authenticated',oid,'TRUNCATE')"), []);
    assert.deepEqual(await rows("select has_schema_privilege('authenticated','public','CREATE') as allowed"), [{ allowed: false }]);
  });
  await check("anon não lê view nem executa RPC", async () => {
    await denied(() => role("anon", null, () => rows("select * from meta_ads_daily_v")));
    await denied(() => role("anon", null, () => rows("select ads_resumo($1,current_date,current_date)", [A])));
  });
  for (const [user, count] of [[viewer, 1], [outsider, 0], [admin, 2]] as const) {
    await check(`view filtrada para ${user}`, async () => { assert.equal((await role("authenticated", user, () => rows("select * from meta_ads_daily_v"))).length, count); });
  }
  await check("service_role continua lendo ambos os tenants", async () => { assert.equal((await role("service_role", null, () => rows("select * from meta_ads_daily_v"))).length, 2); });
  await check("membro não lê conexões/tokens CRM", async () => {
    assert.deepEqual(await role("authenticated", viewer, () => rows("select * from crm_connections")), []);
    await denied(() => role("authenticated", viewer, () => rows("insert into crm_connections(client_id,provider) values ($1,'kommo')", [A])));
  });
  await check("admin conserva gestão de conexões CRM", async () => {
    await role("authenticated", admin, async () => {
      assert.equal((await rows("select access_token from crm_connections")).length, 2);
      assert.equal((await rows("update crm_connections set subdomain='example' where id=$1 returning id", [connectionA])).length, 1);
    });
  });
  await check("credenciais legadas não são selecionáveis pelo navegador", async () => {
    for (const user of [viewer, admin]) for (const column of ["wts_api_token", "digisac_token", "digisac_url"]) await denied(() => role("authenticated", user, () => rows(`select ${column} from clients`)));
    await denied(() => role("authenticated", admin, () => rows("select access_token from client_ad_accounts")));
    assert.equal((await role("authenticated", viewer, () => rows("select name from clients"))).length, 1);
    // Rótulo do custo do ROI: lido pela tela do cliente junto com o perfil (getClient).
    assert.deepEqual(await role("authenticated", viewer, () => rows("select rotulo_custo from clients")), [{ rotulo_custo: "venda" }]);
    // Marca de clínica de teste: lida pelas listas do admin (fica fora das contagens de problema).
    assert.deepEqual(await role("authenticated", viewer, () => rows("select eh_teste from clients")), [{ eh_teste: false }]);
  });
  await check("editor classifica post próprio e não pode alterar identidade/métricas", async () => {
    await role("authenticated", editor, async () => { assert.equal((await rows("update instagram_posts set tema='Tema profissional' where id=$1 returning tema", [postA])).length, 1); });
    for (const update of ["reach=999", `client_id='${B}'`, `instagram_account_id='${accountB}'`, "caption='Fraude'"]) await denied(() => role("authenticated", editor, () => rows(`update instagram_posts set ${update} where id=$1`, [postA])));
  });
  await check("viewer não altera classificação nem sugestão", async () => {
    await role("authenticated", viewer, async () => {
      assert.deepEqual(await rows("update instagram_posts set tema='Indevido' where id=$1 returning id", [postA]), []);
      assert.deepEqual(await rows("update content_angle_suggestions set status='accepted' where id=$1 returning id", [suggestion]), []);
    });
  });
  await check("editor altera apenas status das sugestões", async () => {
    await role("authenticated", editor, async () => { assert.equal((await rows("update content_angle_suggestions set status='accepted' where id=$1 returning id", [suggestion])).length, 1); });
    await denied(() => role("authenticated", editor, () => rows("update content_angle_suggestions set rationale='Fraude' where id=$1", [suggestion])));
  });
  await check("service_role mantém sincronização de métricas", async () => {
    await role("service_role", null, async () => { assert.equal((await rows("update instagram_posts set reach=200 where id=$1 returning id", [postA])).length, 1); });
  });
  await check("RPC Jornada não duplica receita por interação", async () => {
    const r = await role("authenticated", viewer, () => db.query<{ r: { receita: number; posts: { receita: number }[]; links: { receita: number }[] } }>("select jornada_resumo($1,current_date,current_date) as r", [A]));
    assert.equal(r.rows[0].r.receita, 500);
    assert.equal(r.rows[0].r.posts[0].receita, 500);
    assert.equal(r.rows[0].r.links[0].receita, 500);
  });
  await check("RPCs Jornada faltantes são reproduzíveis e isoladas", async () => {
    await role("authenticated", viewer, async () => {
      assert.equal((await rows("select * from buscar_pessoas($1,'Pessoa')", [A])).length, 1);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'Pessoa')", [B]), []);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'%_')", [A]), []);
      const result = await db.query<{ r: { pessoa: Record<string, unknown>; linha: unknown[] } }>("select jornada_pessoa($1) as r", [personA]);
      assert.equal(result.rows[0].r.pessoa.telefone_final, "…1234");
      assert.equal(result.rows[0].r.linha.length, 2);
      assert.equal("email" in result.rows[0].r.pessoa, false);
      assert.deepEqual(await rows("select jornada_pessoa($1) as r", [personB]), [{ r: null }]);
      assert.deepEqual(await rows("select jornada_resumo($1) as r", [B]), [{ r: null }]);
      assert.equal((await rows("select jornada_resumo($1) as r", [A])).length, 1);
    });
  });
  await check("mensagens só pela RPC com auditoria e tenant consistente", async () => {
    await role("authenticated", viewer, async () => {
      assert.deepEqual(await rows("select * from mensagens"), []);
      assert.deepEqual((await rows<{ texto: string }>("select texto from ler_mensagens($1)", [conversationA])).map((r) => r.texto), ["Mensagem A"]);
      assert.deepEqual(await rows("select * from ler_mensagens($1)", [conversationB]), []);
      assert.equal((await rows("select * from listar_conversas($1,-1,-5)", [A])).length, 1);
      assert.equal((await rows("select * from listar_conversas($1,10000,0)", [A])).length, 1);
      const comCanal = await rows<{ canal: string }>("select canal from listar_conversas_canal($1,10,0)", [A]);
      assert.equal(comCanal.length, 1);
      assert.ok(["whatsapp", "instagram", "facebook"].includes(comCanal[0].canal));
      assert.deepEqual(await rows("select * from listar_conversas_canal($1,10,0)", [B]), [], "outra clínica não lista");
      // Lê o audit log como owner dentro da transação, sem concedê-lo ao membro.
      await db.exec("reset role");
      assert.equal((await rows("select * from acessos_conversas where user_id=$1", [viewer])).length, 4);
    });
  });
  await check("agendou lido na conversa entra na fila de conversões só com a chave ligada e sem duplicar o CRM", async () => {
    await db.exec("begin");
    try {
      const fila = () => rows<{ origem: string; external_lead_id: string; n: number }>(
        "select origem, external_lead_id, count(*)::int as n from sap_conversoes where clinica_id=$1 group by 1,2 order by 1", [clinicA]);
      await db.query("insert into conversas_resumos(conversa_id,client_id,resumo,ate_msg_em,gerado_em) values ($1,$2,'{\"situacao\":\"agendou\"}',now(),now())", [conversationA, A]);
      assert.deepEqual(await fila(), [], "desligado por padrão");
      await db.query("update sap_clinicas set conversoes_da_conversa=true where id=$1", [clinicA]);
      await db.query("update conversas_resumos set resumo=resumo where conversa_id=$1", [conversationA]);
      assert.deepEqual(await fila(), [{ origem: "conversa", external_lead_id: `conv_${conversationA}`, n: 2 }]);
      await db.query("update sap_clinicas set conversoes_meta=true, meta_pixel_id='123' where id=$1", [clinicA]);
      const lote = (await rows<{ l: { origem_crm: string; ph: string | null; em: string | null; etapa: string }[] }>("select sap_conversoes_lote('meta',10) as l"))[0].l;
      assert.equal(lote.length, 1);
      assert.equal(lote[0].etapa, "EtapaB");
      assert.equal(lote[0].origem_crm, "conversa_wts");
      assert.ok(lote[0].ph && lote[0].em, "casa pelo telefone e e-mail da pessoa, já com hash");
      // Conversa ligada a lead do CRM: usa a chave do lead (a mesma que o CRM criaria).
      await db.query("delete from sap_conversoes where clinica_id=$1", [clinicA]);
      await db.query("update conversas set lead_id=$1 where id=$2", [leadA, conversationA]);
      await db.query("update conversas_resumos set resumo=resumo where conversa_id=$1", [conversationA]);
      await db.query("update conversas_resumos set resumo=resumo where conversa_id=$1", [conversationA]);
      assert.deepEqual(await fila(), [{ origem: "crm", external_lead_id: "fixture", n: 2 }]);
      // Conversa antiga (fora do prazo de 7 dias da Meta) não entra.
      await db.query("delete from sap_conversoes where clinica_id=$1", [clinicA]);
      await db.query("update conversas_resumos set ate_msg_em=now()-interval '8 days', resumo=resumo where conversa_id=$1", [conversationA]);
      assert.deepEqual(await fila(), []);
    } finally { await db.exec("rollback"); }
  });
  await check("service_role consegue propor Brand Brain ativo", async () => {
    await role("service_role", null, async () => {
      assert.deepEqual(await rows("select tem_modulo($1,'brand_brain') as ok", [A]), [{ ok: true }]);
      assert.deepEqual(await rows("select brain_propor($1,$2::jsonb,$3) as n", [A, JSON.stringify([{ memoria: "identidade", chave: "proposta_valor", valor: "Atendimento humanizado em cada etapa", fonte: "equipe" }]), executionA]), [{ n: 1 }]);
    });
  });
  await check("aprovação incompleta antiga não autoriza marco e não reabre Hub com contrato explícito", async () => {
    // A fixture da revisão antiga não tem rodada, conferência nem vínculo exato
    // ClickUp; aceitá-la novamente seria regressão da PR169.
    for (const [clinic, marco, evidence] of [[clinicA, 5, "Evidência aprovada pela equipe"], [clinicB, 5, "Evidência aprovada pela equipe"], [clinicA, 6, "Evidência aprovada pela equipe"], [clinicA, 5, "Evidência adulterada"]] as const) {
      await assert.rejects(() => role("service_role", null, () => rows("select agentes_marcar_marco($1,$2,$3,$4)", [approvalA, clinic, marco, evidence])), /aprovacao fora do escopo/);
    }
    await denied(() => role("authenticated", admin, () => rows("select agentes_marcar_marco($1,$2,5,$3)", [approvalA, clinicA, "Evidência aprovada pela equipe"])));
    await role("authenticated", viewer, async () => {
      assert.deepEqual(await rows("select tem_modulo($1,'hub') as ok",[A]),[{ok:false}]);
      assert.deepEqual(await rows("select tem_modulo($1,'brand_brain') as ok",[A]),[{ok:true}]);
    });
  });
  await check("aprovação completa PR169 marca somente o marco conferido e restaura JWT", async () => {
    await role("service_role",null,async()=>{
      await rows("update sap_clinicas set d0=current_date,clickup_folder_id='fixture-folder' where id=$1",[clinicA]);
      await rows(`insert into sap_acessos(clinica_id,item,status,confirmado_em,confirmado_por)
        select $1,item,'confirmado',current_date,'Equipe fictícia' from public.operacao_acessos_catalogo()`,[clinicA]);
      await rows("insert into sap_marco_vinculos(clinica_id,marco,clickup_task_id) values($1,5,'fixture-task')",[clinicA]);
      await rows(`update agente_execucoes set fluxo='acessos_criticos',estado='rodando',passo_atual=7,
        contexto=jsonb_build_object('clinica_id',$1::text,'rodada_marco','fixture-round','aprovacao_marco',$2::text,
          'clickup_confirmado',jsonb_build_object('task_id','fixture-task','folder_id','fixture-folder','status','closed','em',now()))
        where id=$3`,[clinicA,approvalA,executionA]);
      await rows("update aprovacoes set criado_em=now(),proposta=proposta||jsonb_build_object('rodada','fixture-round') where id=$1",[approvalA]);
      await rows("select agentes_marcar_marco($1,$2,5,$3)",[approvalA,clinicA,"Evidência aprovada pela equipe"]);
      assert.deepEqual(await rows("select auth.jwt() as claims"),[{claims:{role:"service_role"}}]);
      assert.equal((await rows("select 1 from sap_marco_status where clinica_id=$1 and marco=5 and concluido_em is not null",[clinicA])).length,1);
      assert.equal((await rows("select 1 from aprovacoes where id=$1 and executada_em is not null",[approvalA])).length,1);
      await rows("select agentes_marcar_marco($1,$2,5,$3)",[approvalA,clinicA,"Evidência aprovada pela equipe"]); // Mesmo efeito, uma aprovação.
    });
  });
  const invalidRelations: [string, Record<string, unknown>][] = [
    ["instagram_posts", { instagram_account_id: accountB, windsor_media_id: "bad" }],
    ["instagram_account_daily_metrics", { instagram_account_id: accountB, date: "2026-01-01" }],
    ["instagram_stories", { instagram_account_id: accountB, ig_media_id: "bad" }],
    ["instagram_comments", { instagram_post_id: postB, external_comment_id: "bad", text: "Fixture" }],
    ["crm_leads", { crm_connection_id: connectionB, provider: "kommo", external_lead_id: "bad", event_type: "add", raw_payload: {} }],
    ["crm_raw_events", { crm_connection_id: connectionB, event_key: "bad", raw_payload: {} }],
    ["crm_leads", { crm_connection_id: connectionA, pessoa_id: personB, provider: "kommo", external_lead_id: "bad", event_type: "add", raw_payload: {} }],
    ["crm_lead_eventos", { crm_connection_id: connectionB, external_lead_id: "bad", tipo: "entrou" }],
    ["links_rastreados", { instagram_post_id: postB, codigo_ref: "bad", tipo: "bio", destino_url: "https://example.test" }],
    ["toques", { pessoa_id: personB, tipo: "comentario", ocorreu_em: "2026-01-01", fonte: "fixture", externo_id: "bad" }],
    ["toques", { link_id: linkB, tipo: "clique_link", ocorreu_em: "2026-01-01", fonte: "fixture", externo_id: "bad" }],
    ["toques", { instagram_post_id: postB, tipo: "comentario", ocorreu_em: "2026-01-01", fonte: "fixture", externo_id: "bad" }],
    ["conversas", { pessoa_id: personB, provider: "wts", externo_id: "bad" }],
    ["conversas", { lead_id: leadB, provider: "wts", externo_id: "bad" }],
    ["mensagens", { conversa_id: conversationB, direcao: "entrada", enviada_em: "2026-01-01", externo_id: "bad" }],
    ["conversas_resumos", { conversa_id: conversationB, resumo: {} }],
    ["conversas_origem_anuncio", { conversa_id: conversationB }],
    ["pautas_conteudo", { post_id: postB, titulo: "Fixture", formato: "reels", objetivo: "autoridade" }],
    ["aprovacoes", { execucao_id: executionB, passo: "bad", risco: "medio", resumo: "Fixture" }],
    ["ia_execucoes", { execucao_id: executionB, finalidade: "Fixture", ok: true }],
    ["brain_itens", { execucao_id: executionB, memoria: "identidade", chave: "bad", valor: "Fixture", fonte: "Fixture" }],
  ];
  for (const [table, data] of invalidRelations) await check(`${table}: rejeita vínculo entre tenants mesmo no service_role`, async () => {
    const values = { client_id: A, ...data };
    const columns = Object.keys(values);
    await denied(() => role("service_role", null, () => db.query(`insert into ${table}(${columns.join(",")}) values (${columns.map((_, n) => `$${n + 1}`).join(",")})`, Object.values(values))), "23503");
  });
  await check("FKs preservam ações de exclusão e vínculos opcionais", async () => {
    await role("service_role", null, async () => {
      await rows("delete from pessoas where id=$1", [personA]);
      const result = await db.query<{ pessoa_id: string | null; client_id: string }>("select pessoa_id,client_id from crm_leads where id=$1", [leadA]);
      assert.deepEqual(result.rows[0], { pessoa_id: null, client_id: A });
      await rows("delete from clients where id=$1", [A]);
      assert.deepEqual(await rows("select * from conversas where client_id=$1", [A]), []);
    });
  });
  await check("migrações de segurança da PR169 são reaplicáveis sem apagar dados legados", async () => {
    // A garantia de replay é das correções da PR169; migrações aditivas de módulos
    // posteriores continuam sendo aplicadas uma vez pelo runner de migrations.
    for (const file of hardening.filter(f=>f<"20261023000000")) await apply(file);
    assert.equal((await rows("select * from mensagens where externo_id='legacy-mismatch'")).length, 1);
  });
  const hostedCredentialDelta = files.find((file) => file.endsWith("_hosted_credential_boundary.sql"));
  assert.ok(hostedCredentialDelta, "delta do catálogo hospedado deve estar versionado");
  await check("delta hospedado fecha credenciais sem depender de migração histórica", async () => {
    // Reproduz a configuração REAL de grants em produção, além de grants
    // explícitos por coluna que REVOKE SELECT da tabela sozinho não remove.
    await db.exec(`grant select on clients, client_ad_accounts to authenticated;
      grant select (wts_api_token, digisac_token) on clients to public, anon, authenticated;
      grant select (access_token) on client_ad_accounts to public, anon, authenticated;`);
    await db.query("insert into client_ad_accounts(client_id,ad_account_id,access_token) values ($1,'act-hosted-regression','fake-ad-token')", [A]);
    assert.deepEqual(await role("authenticated", viewer, () => rows("select wts_api_token,digisac_token from clients where id=$1", [A])), [{ wts_api_token: "fake-wts", digisac_token: "fake-digisac" }]);
    assert.deepEqual(await role("authenticated", viewer, () => rows("select access_token from client_ad_accounts where client_id=$1", [A])), [{ access_token: "fake-ad-token" }]);
    await apply(hostedCredentialDelta);
    for (const user of [viewer, admin]) {
      for (const column of ["wts_api_token", "digisac_token", "digisac_url"]) await denied(() => role("authenticated", user, () => rows(`select ${column} from clients`)));
      await denied(() => role("authenticated", user, () => rows("select access_token from client_ad_accounts")));
    }
    for (const table of ["clients", "client_ad_accounts"]) assert.deepEqual(await rows("select has_any_column_privilege('anon',$1,'SELECT') as allowed", [table]), [{ allowed: false }]);
    assert.deepEqual(await role("authenticated", viewer, () => rows("select name,ticket_medio,ads_planilha_url from clients where id=$1", [A])), [{ name: "Clínica A", ticket_medio: null, ads_planilha_url: null }]);
    assert.deepEqual(await role("service_role", null, () => rows("select access_token from client_ad_accounts where client_id=$1", [A])), [{ access_token: "fake-ad-token" }]);
    await apply(hostedCredentialDelta); // Reaplicável sem alterar valores.
    assert.deepEqual(await rows("select wts_api_token from clients where id=$1", [A]), [{ wts_api_token: "fake-wts" }]);
  });
  await check("delta hospedado fecha staging existente e seus grants por coluna", async () => {
    await db.exec(`create table _flw_stage(card_id text, card jsonb, contact jsonb, contact_done boolean);
      create table _flw_steps(id text,title text,phase text);
      alter table _flw_stage enable row level security;
      alter table _flw_steps enable row level security;
      grant all on _flw_stage,_flw_steps to public,anon,authenticated;
      grant select (card_id),update (contact_done) on _flw_stage to public,anon,authenticated;
      grant select (id) on _flw_steps to public,anon,authenticated;`);
    await apply(hostedCredentialDelta);
    for (const table of ["_flw_stage", "_flw_steps"]) {
      assert.deepEqual(await rows("select relrowsecurity as rls,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as table_access,has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES') as column_access from pg_class where oid=$1::regclass", [table]), [{ rls: true, table_access: false, column_access: false }]);
      assert.deepEqual(await rows("select has_any_column_privilege('anon',$1,'SELECT,INSERT,UPDATE,REFERENCES') as allowed", [table]), [{ allowed: false }]);
    }
  });
  await check("bootstrap preserva assinatura de buscar_pessoas já existente no hospedado", async () => {
    await db.exec("begin");
    try {
      await db.exec(`drop function public.buscar_pessoas(uuid,text);
        create function public.buscar_pessoas(p_client uuid,p_q text)
        returns table(id uuid,nome text,ig_username text,telefone_final text,origem text)
        language sql stable security definer set search_path = public,pg_temp
        as $$ select null::uuid,null::text,null::text,null::text,null::text where false $$;`);
      await db.exec(await readFile(new URL("20261022140000_jornada_read_contracts.sql", dir), "utf8"));
      assert.deepEqual(await rows("select pg_get_function_result('public.buscar_pessoas(uuid,text)'::regprocedure) as result"), [{ result: "TABLE(id uuid, nome text, ig_username text, telefone_final text, origem text)" }]);
    } finally { await db.exec("rollback"); }
  });
  await check("delta de busca literal corrige wildcard hospedado e preserva contratos de cinco/quatro colunas", async () => {
    const literalDelta = files.find((file) => file.endsWith("_literal_people_search.sql"));
    assert.ok(literalDelta);
    const deltaSql = await readFile(new URL(literalDelta, dir), "utf8");
    const expectedFour = "TABLE(id uuid, nome text, telefone_final text, ig_username text)";
    const expectedFive = "TABLE(id uuid, nome text, ig_username text, telefone_final text, origem text)";
    // Ausência é esperada na ordenação fresh; o delta não cria um contrato novo.
    await db.exec("begin");
    try {
      await db.exec("drop function public.buscar_pessoas(uuid,text)");
      await db.exec(deltaSql);
      assert.deepEqual(await rows("select to_regprocedure('public.buscar_pessoas(uuid,text)') as f"), [{ f: null }]);
    } finally { await db.exec("rollback"); }

    await db.exec("begin");
    try {
      await db.exec(`drop function public.buscar_pessoas(uuid,text);
        create function public.buscar_pessoas(p_client uuid,p_q text)
        returns table(id uuid,nome text,ig_username text,telefone_final text,origem text)
        language sql stable security definer set search_path = public
        as $$ select p.id,p.nome,p.ig_username,
          case when p.telefone is not null then '…'||right(regexp_replace(p.telefone,'\\D','','g'),4) end,p.origem_primeira
          from public.pessoas p where p.client_id=p_client
            and (public.is_app_admin() or public.is_client_member(p_client))
            and (p.nome ilike '%'||p_q||'%' or p.ig_username ilike '%'||p_q||'%')
          order by p.atualizado_em desc limit 30 $$;`);
      await db.query("update pessoas set ig_username='perfil_clinica',origem_primeira='Orgânico' where id=$1", [personA]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      assert.equal((await rows("select * from buscar_pessoas($1,'%_')", [A])).length, 1, "reproduz wildcard da versão hospedada");
      await db.exec("reset role");
      await db.exec(deltaSql); // Somente o delta novo, sem reaplicar bootstrap.
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'%_')", [A]), []);
      assert.equal((await rows("select * from buscar_pessoas($1,' @perfil_clinica ')", [A])).length, 1);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'1234')", [A]), [{ id: personA, nome: "Pessoa A", ig_username: "perfil_clinica", telefone_final: "…1234", origem: "Orgânico" }]);
      for (const term of [null, "", " ", "a", "@", "@@", "234", "X".repeat(101)]) assert.deepEqual(await rows("select * from buscar_pessoas($1,$2)", [A, term]), []);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'Pessoa')", [B]), []);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: outsider, role: "authenticated" })]);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'Pessoa')", [A]), []);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
      assert.equal((await rows("select * from buscar_pessoas($1,'Pessoa')", [B])).length, 1);
      await db.exec("reset role");
      await db.query("insert into pessoas(client_id,nome) values ($1,'Taxa 100%_real'),($1,$2)", [A, "X".repeat(100)]);
      await db.query("insert into pessoas(client_id,nome,atualizado_em) select $1,'Pessoa limite '||n::text,now() from generate_series(1,35) n", [A]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      assert.equal((await rows("select * from buscar_pessoas($1,'%_')", [A])).length, 1, "encontra somente o percentual/sublinhado literal");
      assert.equal((await rows("select * from buscar_pessoas($1,$2)", [A, "X".repeat(100)])).length, 1);
      assert.equal((await rows("select * from buscar_pessoas($1,'Pe')", [A])).length, 30);
      const first = await rows("select id from buscar_pessoas($1,'limite')", [A]);
      assert.equal(first.length, 30);
      assert.deepEqual(await rows("select id from buscar_pessoas($1,'limite')", [A]), first, "ordenação estável para timestamps iguais");
      await db.exec("reset role");
      await db.exec(deltaSql); // Reaplicação mantém retorno/grants.
      assert.deepEqual(await rows("select pg_get_function_result('public.buscar_pessoas(uuid,text)'::regprocedure) as result"), [{ result: expectedFive }]);
      assert.deepEqual(await rows("select has_function_privilege('anon','public.buscar_pessoas(uuid,text)','EXECUTE') as anon,has_function_privilege('authenticated','public.buscar_pessoas(uuid,text)','EXECUTE') as authenticated,has_function_privilege('service_role','public.buscar_pessoas(uuid,text)','EXECUTE') as service"), [{ anon: false, authenticated: true, service: true }]);
    } finally { await db.exec("rollback"); }

    await db.exec("begin");
    try {
      assert.deepEqual(await rows("select pg_get_function_result('public.buscar_pessoas(uuid,text)'::regprocedure) as result"), [{ result: expectedFour }]);
      await db.exec(deltaSql);
      await db.exec(deltaSql);
      assert.deepEqual(await rows("select pg_get_function_result('public.buscar_pessoas(uuid,text)'::regprocedure) as result"), [{ result: expectedFour }]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'Pessoa')", [A]), [{ id: personA, nome: "Pessoa A", telefone_final: "…1234", ig_username: null }]);
      assert.deepEqual(await rows("select * from buscar_pessoas($1,'%_')", [A]), []);
    } finally { await db.exec("rollback"); }
    await db.exec("begin");
    try {
      await db.exec(`drop function public.buscar_pessoas(uuid,text);
        create function public.buscar_pessoas(p_client uuid,p_q text) returns table(id uuid,nome text)
        language sql as $$select null::uuid,null::text where false$$;`);
      await assert.rejects(() => db.exec(deltaSql), /retorno inesperado/);
    } finally { await db.exec("rollback"); }
  });
  await check("receita em jogo corrige boolean malformado da RPC hospedada sem alterar contratos", async () => {
    const delta = "20261022160000_receita_em_jogo_integrity.sql";
    await db.exec("begin");
    try {
      await db.exec(await readFile(new URL("20261021170000_receita_em_jogo.sql", dir), "utf8"));
      await db.query("insert into conversas_resumos(conversa_id,client_id,resumo) values ($1,$2,$3)", [conversationA, A, { recuperavel: "talvez", comercial: "inválido" }]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("set local role authenticated; savepoint legacy_boolean");
      await denied(() => rows("select receita_em_jogo($1,current_date,current_date)", [A]), "22P02");
      await db.exec("rollback to savepoint legacy_boolean; reset role");
      await db.exec(await readFile(new URL(delta, dir), "utf8"));
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date)->'recuperaveis' as n", [A]), [{ n: 0 }]);
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [B]), [{ r: null }]);
      await db.exec("reset role");
      await db.query("update conversas_resumos set resumo=$1 where conversa_id=$2", [{ recuperavel: true, comercial: true }, conversationA]);
      await db.query("update clients set ticket_medio=100.25 where id=$1", [A]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [A]), [{ r: { recuperaveis: 1, ticket: 100.25, fonte_ticket: "equipe", vendas_crm: 1, valor: 100.25 } }]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: outsider, role: "authenticated" })]);
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [A]), [{ r: null }]);
      await db.exec("reset role");
      assert.deepEqual(await rows("select pg_get_function_identity_arguments('public.receita_em_jogo(uuid,date,date)'::regprocedure) as args,pg_get_function_result('public.receita_em_jogo(uuid,date,date)'::regprocedure) as result"), [{ args: "p_client uuid, p_de date, p_ate date", result: "jsonb" }]);
    } finally { await db.exec("rollback"); }
  });
  await check("origem do lead vem de todos os sinais do CRM, com o campo do CRM em primeiro", async () => {
    await db.exec("begin");
    try {
      const casos: [string, string, unknown, string | null, string | null, string | null][] = [
        // [id externo, provedor, payload, source enviado, origem esperada, caminho esperado]
        ["o1", "kommo", { _embedded: { tags: [{ name: "Paciente ativo" }, { name: "Origem-Instagram" }] } }, null, "Instagram", "etiqueta"],
        ["o2", "kommo", { _embedded: { tags: [{ name: "Aguardando Retorno" }, { name: "Follow D1" }] } }, null, null, null],
        ["o3", "kommo", { _embedded: { tags: [{ name: "fb1773403903694094" }] } }, null, "Anúncio", "etiqueta"],
        ["o4", "kommo", { custom_fields_values: [{ field_code: "UTM_SOURCE", values: [{ value: "ig" }] }] }, null, "Instagram", "utm"],
        ["o5", "kommo", { _embedded: { tags: [{ name: "Origem-Instagram" }] } }, "Indicação da Dra.", "Indicação da Dra.", "crm"],
        ["o6", "digisac", { etiquetas: ["Dra. Rafaela", "Unimed [Origem]"] }, null, "Unimed", "etiqueta"],
        ["o7", "flwchat", { contato_tags: ["Tipo · Paciente", "pacientes base"] }, null, "Paciente antigo", "etiqueta"],
        ["o8", "clint", { fields: { form_id: "1", ad_id: "2" } }, null, "Anúncio", "formulario"],
        ["o9", "clint", { fields: { fonte: "Google | qualificado" } }, null, "Google", "campo"],
        ["o10", "clint", { contact: { id: "c1" }, contato_tags: ["Nexo | Origem não documentada", "bk_perfil_medico", "site_doctor"] }, null, "Site", "etiqueta"],
        ["o11", "clint", { contato_tags: ["black_lp1_autoridade"] }, null, "Site", "etiqueta"],
        ["o12", "clint", { contato_tags: ["Social Selling", "ig-social"] }, null, "Prospecção ativa", "etiqueta"],
        ["o13", "kommo", { _embedded: { tags: [{ name: "Origem-PacienteAntigo" }] } }, null, "Paciente antigo", "etiqueta"],
        ["o14", "clint", { contato_tags: ["Nexo | Origem não documentada"] }, null, null, null],
        ["o16", "kommo", { custom_fields_values: [{ field_code: "UTM_SOURCE", values: [{ value: "{{placement}}" }] }] }, null, "Anúncio", "utm"],
        ["o17", "kommo", { custom_fields_values: [{ field_code: "UTM_SOURCE", values: [{ value: "meta_ads" }] }] }, null, "Anúncio", "utm"],
        ["o18", "clint", { contato_tags: ["whatsapp", "disparo_1-Black"] }, null, "Disparo para lista", "etiqueta"],
        ["o19", "clint", { contato_tags: ["resgate", "ue:base"] }, null, "Paciente antigo", "etiqueta"],
        ["o20", "clint", { contato_tags: ["hubla", "import_datacrazy"] }, null, "Base importada", "etiqueta"],
      ];
      for (const [id, provider, raw, source] of casos) {
        await db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,source,occurred_at) values ($1,$2,$3,$4,'add',$5,$6,now())", [A, connectionA, provider, id, raw, source]);
      }
      for (const [id, , , , origem, como] of casos) {
        assert.deepEqual(await rows("select source, origem_como from crm_leads where client_id=$1 and external_lead_id=$2", [A, id]), [{ source: origem, origem_como: como }], id);
      }
      // A sincronização seguinte manda o campo vazio de novo e uma etiqueta nova: a origem acompanha o CRM.
      await db.query(`update crm_leads set source=null, raw_payload='{"_embedded":{"tags":[{"name":"Indicação"}]}}' where client_id=$1 and external_lead_id='o2'`, [A]);
      assert.deepEqual(await rows("select source, origem_como from crm_leads where client_id=$1 and external_lead_id='o2'", [A]), [{ source: "Indicação", origem_como: "etiqueta" }]);
      // A equipe preenche o campo no CRM: o campo passa a valer.
      await db.query("update crm_leads set source='Google Ads' where client_id=$1 and external_lead_id='o2'", [A]);
      assert.deepEqual(await rows("select source, origem_como from crm_leads where client_id=$1 and external_lead_id='o2'", [A]), [{ source: "Google Ads", origem_como: "crm" }]);
      // Tags lidas do contato da Clint chegam aos leads do contato e dão a origem.
      await db.query(`insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,occurred_at) values ($1,$2,'clint','o15','add','{"contact":{"id":"c9"}}',now())`, [A, connectionA]);
      await db.query("insert into crm_contato_tags(crm_connection_id,contato_id,tags) values ($1,'c9',array['instagram_douglas'])", [connectionA]);
      assert.deepEqual(await rows("select crm_aplicar_tags_contato($1) as n", [connectionA]), [{ n: 1 }]);
      assert.deepEqual(await rows("select source, origem_como from crm_leads where client_id=$1 and external_lead_id='o15'", [A]), [{ source: "Instagram", origem_como: "etiqueta" }]);
      assert.deepEqual(await rows("select crm_aplicar_tags_contato($1) as n", [connectionA]), [{ n: 0 }], "segunda vez não regrava");
      await denied(() => role("authenticated", admin, () => rows("select crm_aplicar_tags_contato($1)", [connectionA])));
    } finally {
      await db.exec("rollback");
    }
  });
  await check("lead novo conta pessoa nova em funil de captação; ganho sem valor alerta", async () => {
    await db.exec("begin");
    try {
      await db.query("delete from crm_leads where client_id=$1", [A]);
      const lead = (id: string, pipeline: string, phone: string | null, dias: number, outcome = "open", price: number | null = null, source: string | null = null) =>
        db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,pipeline_id,contact_phone,raw_payload,outcome,price,source,occurred_at) values ($1,$2,'kommo',$3,'add',$4,$5,'{}',$6,$7,$8,now() - make_interval(days => $9))", [A, connectionA, id, pipeline, phone, outcome, price, source, dias]);
      await db.query("insert into crm_funil_papel(crm_connection_id,pipeline_id,papel) values ($1,'compras','compra')", [connectionA]);
      await lead("p1a", "captacao", "(67) 99999-1111", 3, "won", null, "Instagram"); // pessoa nova, 3 cards
      await lead("p1b", "captacao", "+55 67 9999-1111", 2, "won");
      await lead("p1c", "comercial", "67999991111", 1, "lost");
      await lead("p2a", "captacao", "(67) 98888-2222", 60);                        // já existia antes: recorrente
      await lead("p2b", "captacao", "(67) 98888-2222", 2, "won", 300);
      await lead("p3a", "compras", "(67) 97777-3333", 2, "won", 500);               // só funil de compra
      await lead("p4a", "captacao", "(67) 96666-4444", 2, "open", null, "Paciente antigo"); // paciente da casa
      await lead("p5a", "captacao", null, 1, "won");                               // sem telefone: o card é a pessoa
      await lead("p6a", "captacao", "(67) 95555-6666", 1, "won");
      await lead("p7a", "captacao", "(67) 94444-7777", 1, "open", null, "Já sou paciente"); // texto da equipe: paciente da casa
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      const de = "current_date - 10", ate = "current_date";
      // Ganhos contam cards (vendas), como no ROI e no painel; novos contam pessoas.
      assert.deepEqual(await rows(`select novos, ganhos, perdidos from crm_leads_resumo_periodo($1, ${de}, ${ate})`, [A]), [{ novos: 3, ganhos: 6, perdidos: 0 }]);
      assert.deepEqual(await rows(`select sum(total)::int as t from crm_leads_por_dia_periodo($1, ${de}, ${ate})`, [A]), [{ t: 3 }]);
      const p = (await rows<{ cards: number; pessoas: number; pessoas_novas: number }>(`select cards, pessoas, pessoas_novas from crm_pessoas_resumo_periodo($1, ${de}, ${ate})`, [A]))[0];
      assert.deepEqual({ ...p }, { cards: 9, pessoas: 7, pessoas_novas: 3 });
      const roi = (await rows<{ r: { leads: number; leads_com_origem: number } }>(`select roi_periodo($1, ${de}, ${ate}) as r`, [A]))[0].r;
      assert.equal(roi.leads, 3);
      assert.equal(roi.leads_com_origem, 1);
      // 6 ganhos em 90 dias, 2 com valor: alerta.
      const alertas = await rows<{ id: string }>("select x->>'id' as id from jsonb_array_elements(qualidade_dados($1)) x", [A]);
      assert.ok(alertas.some((a) => a.id === "crm-ganho-sem-valor"), JSON.stringify(alertas));
      // A equipe define o papel do funil; usuário comum não.
      await rows("select crm_definir_papel_funil($1,'comercial','venda')", [connectionA]);
      await db.exec("reset role");
    } finally {
      await db.exec("rollback");
    }
    await db.exec("begin");
    try {
      await assert.rejects(() => role("authenticated", viewer, () => rows("select crm_definir_papel_funil($1,'x','compra')", [connectionA])), /apenas a equipe/);
      await denied(() => role("authenticated", admin, () => rows("select * from crm_pessoas_leads($1)", [A])));
    } finally {
      await db.exec("rollback");
    }
  });
  await check("auditoria de alertas médios: tags do FlwChat nos cards antigos e parados sem Digisac nem arquivo", async () => {
    await db.exec("begin");
    try {
      // Card antigo do FlwChat (fora do painel): a tag do contato lida depois chega ao card e dá a origem.
      await db.query(`insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,occurred_at) values ($1,$2,'flwchat','fw1','add','{"contactIds":["f9"]}',now())`, [A, connectionA]);
      await db.query("insert into crm_contato_tags(crm_connection_id,contato_id,tags) values ($1,'f9',array['pacientes base'])", [connectionA]);
      assert.deepEqual(await rows("select crm_aplicar_tags_contato($1) as n", [connectionA]), [{ n: 1 }]);
      assert.deepEqual(await rows("select source, origem_como from crm_leads where external_lead_id='fw1'"), [{ source: "Paciente antigo", origem_como: "etiqueta" }]);
      // Parados: Digisac não conta; etapa de arquivo ou consulta confirmada não conta; etapa de negociação conta.
      await db.query("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,status_id,pipeline_name,status_name) values ($1,'p','arq','Funil','LEADS ANTIGOS DO OUTRO FUNIL'),($1,'p','conf','Funil','CONFIRMADO'),($1,'p','neg','Funil','NEGOCIAÇÃO')", [connectionA]);
      assert.deepEqual(await rows("select crm_conta_como_aberto('digisac',$1,'p','neg') as v", [connectionA]), [{ v: false }]);
      assert.deepEqual(await rows("select crm_conta_como_aberto('kommo',$1,'p','arq') as a, crm_conta_como_aberto('kommo',$1,'p','conf') as c, crm_conta_como_aberto('kommo',$1,'p','neg') as n, crm_conta_como_aberto('kommo',$1,'p','sem-nome') as s", [connectionA]), [{ a: false, c: false, n: true, s: true }]);
    } finally {
      await db.exec("rollback");
    }
  });
  await check("reclassificar etapa não vira venda; card que já chega ganho tem o evento", async () => {
    await db.exec("begin");
    try {
      await db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at) values ($1,$2,'kommo','ev1','add','{}','p1','s-ganho','won',now()),($1,$2,'kommo','ev2','add','{}','p1','s-x','open',now())", [A, connectionA]);
      const tipos = async (id: string) => (await rows<{ tipo: string }>("select tipo from crm_lead_eventos where external_lead_id=$1 order by tipo", [id])).map((r) => r.tipo);
      assert.deepEqual(await tipos("ev1"), ["entrou", "ganhou"]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: admin })]);
      await rows("select crm_definir_etapa_resultado($1,'p1','s-x','won')", [connectionA]);
      assert.deepEqual(await rows("select outcome from crm_leads where external_lead_id='ev2'"), [{ outcome: "won" }]);
      assert.deepEqual(await tipos("ev2"), ["entrou"], "reclassificação não grava ganhou");
      // Mudança vinda do CRM continua gravando.
      await db.query("update crm_leads set outcome='lost' where external_lead_id='ev2'");
      assert.deepEqual(await tipos("ev2"), ["entrou", "perdeu"]);
    } finally {
      await db.exec("rollback");
    }
  });
  await check("fechado na origem: confirmar etapa não reabre; em aberto é só open; procedimento sem cair na origem", async () => {
    await db.exec("begin");
    try {
      await db.query("delete from crm_leads where client_id=$1", [A]);
      await db.query("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,status_id,pipeline_name,status_name) values ($1,'pa','acomp','Atendimento','Acompanhamento'),($1,'pa','ag','Atendimento','Agendamento de Implante')", [connectionA]);
      const card = (id: string, status: string, outcome: string, price: number | null, source: string | null) =>
        db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,source,occurred_at) values ($1,$2,'kommo',$3,'add','{}','pa',$4,$5,$6,$7,now())", [A, connectionA, id, status, outcome, price, source]);
      await card("f1", "acomp", "open", 100, "Instagram");
      await card("f2", "acomp", "closed", 40750, "Instagram");
      await card("f3", "acomp", "lost", 50, null);
      await card("f4", "ag", "closed", null, "Paciente antigo");
      await card("f5", "ag", "open", null, null);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: admin })]);
      await db.exec("set local role authenticated");
      const m = (await rows<Record<string, unknown>>("select total_leads, em_atendimento, em_atendimento_valor, abertos, fechados, ganhos, perdidos, consulta_configurada from crm_metricas_essenciais($1)", [A]))[0];
      assert.deepEqual({ ...m, em_atendimento_valor: Number(m.em_atendimento_valor) }, { total_leads: 5, em_atendimento: 1, em_atendimento_valor: 100, abertos: 2, fechados: 2, ganhos: 0, perdidos: 1, consulta_configurada: false });
      // Confirmar a etapa como aberta (o "confirmar em lote") não reabre o card fechado na origem.
      await rows("select crm_definir_etapa_resultado($1,'pa','ag','open')", [connectionA]);
      assert.deepEqual(await rows("select external_lead_id id, outcome from crm_leads where status_id='ag' order by 1"), [{ id: "f4", outcome: "closed" }, { id: "f5", outcome: "open" }]);
      await rows("select crm_definir_etapa_resultado($1,'pa','acomp','won')", [connectionA]);
      assert.deepEqual(await rows("select external_lead_id id, outcome from crm_leads where status_id='acomp' order by 1"), [{ id: "f1", outcome: "won" }, { id: "f2", outcome: "closed" }, { id: "f3", outcome: "won" }]);
      // Etapa marcada como consulta agendada: o número passa a ser fato.
      await rows("select crm_definir_etapa_kpi($1,'pa','ag','consulta_agendada',true)", [connectionA]);
      assert.deepEqual(await rows("select consultas_agendadas, consulta_configurada from crm_metricas_essenciais($1)", [A]), [{ consultas_agendadas: 2, consulta_configurada: true }]);
      // Sem o campo de procedimento, a linha é "Não informado" (não a origem); por fonte, vale a origem. Abertos à parte.
      assert.deepEqual(await rows("select chave, total, abertos from crm_funil_por_campo($1,'%Tipo de Procedim%')", [A]), [{ chave: "Não informado", total: 5, abertos: 1 }]);
      const fonte = await rows<{ chave: string }>("select chave from crm_funil_por_campo($1,'%Fonte do Lead%') order by chave", [A]);
      assert.deepEqual(fonte.map((r) => r.chave), ["Instagram", "Não informado", "Paciente antigo"]);
      assert.deepEqual(await rows("select chave from crm_funil_por_campo_periodo($1,'%Tipo de Procedim%',current_date - 1,current_date + 1)", [A]), [{ chave: "Não informado" }]);
      await db.exec("reset role");
    } finally {
      await db.exec("rollback");
    }
  });
  await check("ROI só com a receita de pessoa vinda de anúncio; CRM do passo a passo pelo volume", async () => {
    await db.exec("begin");
    try {
      await db.query("delete from crm_leads where client_id=$1", [A]);
      await db.query("delete from meta_ads_daily where client_id=$1", [A]);
      const lead = (id: string, pipeline: string, phone: string | null, outcome: string, price: number | null, source: string | null) =>
        db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,pipeline_id,contact_phone,raw_payload,outcome,price,source,occurred_at) values ($1,$2,'kommo',$3,'add',$4,$5,'{}',$6,$7,$8,now() - interval '2 days')", [A, connectionA, id, pipeline, phone, outcome, price, source]);
      await db.query("insert into crm_funil_papel(crm_connection_id,pipeline_id,papel) values ($1,'compras','compra')", [connectionA]);
      await lead("a1", "captacao", "(67) 99999-1111", "open", null, "Anúncio");         // chegou pelo anúncio
      await lead("a2", "compras", "(67) 99999-1111", "won", 1000, null);              // e comprou no checkout
      await lead("b1", "compras", "(67) 98888-2222", "won", 800, null);               // checkout sem origem
      await lead("c1", "captacao", "(67) 97777-3333", "won", 300, "import_base");     // base importada
      await lead("d1", "captacao", null, "won", 200, "Facebook Ads");                // anúncio no próprio card
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: admin })]);
      await db.exec("set local role authenticated");
      const r = (await rows<{ r: Record<string, unknown> }>("select roi_periodo($1, current_date - 10, current_date) as r", [A]))[0].r;
      assert.equal(r.ganhos, 4);
      assert.equal(Number(r.receita), 2300);
      assert.equal(r.ganhos_anuncio, 2);
      assert.equal(r.ganhos_anuncio_com_valor, 2);
      assert.equal(Number(r.receita_anuncio), 1200);
      assert.deepEqual((r.receita_por_origem as { origem: string; ganhos: number; receita: number }[]).map((o) => [o.origem, o.ganhos, Number(o.receita)]), [
        ["Anúncio", 2, 1200], ["Funil de compra, sem origem", 1, 800], ["Base importada", 1, 300],
      ]);
      assert.equal(r.crm_provider, "kommo");
      await db.exec("reset role");
    } finally {
      await db.exec("rollback");
    }
  });
  await check("fila do WhatsApp: abertas antigas à parte, lote de encerramento e conta compartilhada pelo dado do cliente", async () => {
    await db.exec("begin");
    try {
      await db.query("update clients set wts_company_id='empresa-x', active=true where id in ($1,$2)", [A, B]);
      const sessao = (id: string, inicio: string, status: string, fim: string | null) =>
        db.query(`insert into wts_sessions(client_id,session_id,started_at,status,ended_at) values ($1,$2,now() - ${inicio}::interval,$3,${fim ? `now() - ${fim}::interval` : "null"})`, [A, id, status]);
      await sessao("s1", "'1 day'", "IN_PROGRESS", null);
      await sessao("s2", "'20 days'", "IN_PROGRESS", null);
      await sessao("s3", "'30 days'", "IN_PROGRESS", null);
      for (let i = 0; i < 6; i++) await sessao(`l${i}`, "'3 days'", "COMPLETED", "'2 days'");
      await sessao("u1", "'3 days'", "COMPLETED", "'1 day'");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: editor })]);
      await db.exec("set local role authenticated");
      const f = (await rows<{ f: Record<string, unknown> }>("select wts_fila_do_cliente($1, current_date - 10, current_date) as f", [A]))[0].f;
      assert.deepEqual(f, { abertas_7d: 1, abertas_antigas: 2, encerradas: 7, maior_lote: 6, encerradas_em_lote: 6, conta_compartilhada_com: ["Clínica B"] });
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: outsider })]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select wts_fila_do_cliente($1, current_date - 10, current_date) as f", [A]), [{ f: null }]);
      await db.exec("reset role");
    } finally {
      await db.exec("rollback");
    }
  });
  await check("origem pela mensagem pronta de link e pela etapa de paciente; o sync seguinte não apaga", async () => {
    await db.exec("begin");
    try {
      // Só textos fixos de link contam; texto livre não é interpretado.
      const m = async (t: string) => (await rows<{ o: string | null }>("select crm_origem_da_mensagem($1) as o", [t]))[0].o;
      assert.equal(await m("Olá, vim do Instagram e quero agendar uma consulta com a Dra. Mariela."), "Instagram");
      assert.equal(await m("Olá, tudo bem? Estava no Instagram da Dra Lana e gostaria de agendar um horário."), "Instagram");
      assert.equal(await m("Bom dia! Tudo bem?\nVim do Instagram e gostaria de tirar uma dúvida."), "Instagram");
      assert.equal(await m("Olá, vim do Google e gostaria de mais informações sobre Lipedema"), "Google");
      assert.equal(await m("Olá, vim do site e gostaria de mais informações"), "Site");
      assert.equal(await m("*Google Ads*\n\nSua resposta foi registrada como uma ativação"), "Anúncio");
      assert.equal(await m("devo começar a reposição hormonal e se tenho indicação"), null);
      assert.equal(await m("Então só oq vi pelo insta"), null);
      // Card do FlwChat ligado à conversa pela sessão (mesmo se a conversa estiver em outro cliente).
      await db.query(`insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,occurred_at) values ($1,$2,'flwchat','fm1','add','{"sessionId":"s-1","contactIds":["x"]}',now())`, [A, connectionA]);
      const conv = (await rows<{ id: string }>("insert into conversas(client_id,provider,externo_id) values ($1,'wts','s-1') returning id", [B]))[0].id;
      await db.query("insert into mensagens(conversa_id,client_id,direcao,texto,enviada_em,externo_id) values ($1,$2,'entrada','Olá, vim do Instagram e quero agendar',now(),'m1'),($1,$2,'entrada','Quero saber valores',now()+interval '1 minute','m2')", [conv, B]);
      // Card na etapa de paciente da casa.
      await db.query("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,status_id,pipeline_name,status_name) values ($1,'pp','rec','Atendimento','Paciente Recorrente')", [connectionA]);
      await db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,occurred_at) values ($1,$2,'kommo','km1','add','{}','pp','rec',now())", [A, connectionA]);
      // "Reativação" mistura lead novo e paciente: não vira paciente antigo.
      await db.query("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,status_id,pipeline_name,status_name) values ($1,'pp','rea','Atendimento','Reativação')", [connectionA]);
      await db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,occurred_at) values ($1,$2,'kommo','km2','add','{}','pp','rea',now())", [A, connectionA]);
      assert.deepEqual(await rows("select crm_aplicar_origem_externa($1) as n", [A]), [{ n: 2 }]);
      assert.deepEqual(await rows("select external_lead_id id, source, origem_como from crm_leads where external_lead_id in ('fm1','km1') order by 1"), [
        { id: "fm1", source: "Instagram", origem_como: "mensagem" },
        { id: "km1", source: "Paciente antigo", origem_como: "etapa" },
      ]);
      // O sync seguinte manda o campo vazio: a origem lida fica. A equipe preenche no CRM: o campo vale.
      await db.query(`update crm_leads set source=null, raw_payload='{"sessionId":"s-1","novo":1}' where external_lead_id='fm1'`);
      assert.deepEqual(await rows("select source, origem_como from crm_leads where external_lead_id='fm1'"), [{ source: "Instagram", origem_como: "mensagem" }]);
      // Etiqueta que diz a origem chega depois: vale mais que a mensagem.
      await db.query(`update crm_leads set source=null, raw_payload='{"sessionId":"s-1","contato_tags":["Anúncio"]}' where external_lead_id='fm1'`);
      const depois = await rows<{ source: string | null; origem_como: string | null }>("select source, origem_como from crm_leads where external_lead_id='fm1'");
      assert.notEqual(depois[0].origem_como, "mensagem", "etiqueta do CRM vale mais que a mensagem");
      await db.query("update crm_leads set source='Indicação' where external_lead_id='fm1'");
      assert.deepEqual(await rows("select source, origem_como from crm_leads where external_lead_id='fm1'"), [{ source: "Indicação", origem_como: "crm" }]);
      assert.deepEqual(await rows("select crm_aplicar_origem_externa($1) as n", [A]), [{ n: 0 }], "nada novo para aplicar");
      await denied(() => role("authenticated", admin, () => rows("select crm_aplicar_origem_externa(null)")));
    } finally {
      await db.exec("rollback");
    }
  });
  await check("ticket rejeita não finitos e preserva decimal, mediana CRM, SAP e ausência de fonte", async () => {
    await db.exec("begin");
    try {
      await db.query("insert into conversas_resumos(conversa_id,client_id,resumo) values ($1,$2,$3)", [conversationA, A, { recuperavel: true }]);
      for (const [index, price] of [100, 200, 300, 400, 500, "NaN", "Infinity", "-Infinity"].entries()) await db.query("insert into crm_leads(client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,raw_payload,occurred_at) values ($1,$2,'kommo',$3,'add','won',$4::numeric,'{}',now())", [A, connectionA, `ticket-regression-${index}`, price]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      for (const value of ["0", "-1", "NaN", "Infinity", "-Infinity"]) {
        await db.exec("savepoint invalid_ticket");
        await assert.rejects(() => rows("select definir_ticket_cliente($1,$2::numeric)", [A, value]), /valor invalido/);
        await db.exec("rollback to savepoint invalid_ticket");
      }
      await rows("select definir_ticket_cliente($1,100.25)", [A]);
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date)->'valor' as valor", [A]), [{ valor: 100.25 }]);
      await rows("select definir_ticket_cliente($1,null)", [A]);
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [A]), [{ r: { recuperaveis: 1, ticket: 350, fonte_ticket: "crm", vendas_crm: 6, valor: 350 } }]);
      await db.exec("savepoint invalid_direct_ticket");
      await denied(() => rows("update clients set ticket_medio='NaN'::numeric where id=$1", [A]), "23514");
      await db.exec("rollback to savepoint invalid_direct_ticket; reset role");
      await db.query("delete from crm_leads where client_id=$1 and external_lead_id like 'ticket-regression-%'", [A]);
      await db.query("update sap_clinicas set ticket_medio=700 where id=$1", [clinicA]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [A]), [{ r: { recuperaveis: 1, ticket: 700, fonte_ticket: "sap", vendas_crm: 1, valor: 700 } }]);
      await db.exec("reset role");
      await db.query("update sap_clinicas set ticket_medio='NaN'::numeric where id=$1", [clinicA]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date) as r", [A]), [{ r: { recuperaveis: 1, ticket: null, fonte_ticket: null, vendas_crm: 1, valor: null } }]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("savepoint viewer_ticket");
      await assert.rejects(() => rows("select definir_ticket_cliente($1,200)", [A]), /sem permissao/);
      await db.exec("rollback to savepoint viewer_ticket");
    } finally { await db.exec("rollback"); }
  });
  await check("receita exclui resumo legado de outro cliente sem depender da validação da FK", async () => {
    await db.exec("begin");
    try {
      // Somente na base descartável: representa uma linha legada pré-FK.
      await db.exec("alter table conversas_resumos drop constraint conversas_resumos_conversa_id_tenant_fk");
      await db.query("insert into conversas_resumos(conversa_id,client_id,resumo) values ($1,$2,$3)", [conversationA, B, { recuperavel: true, comercial: true }]);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, role: "authenticated" })]);
      await db.exec("set local role authenticated");
      assert.deepEqual(await rows("select receita_em_jogo($1,current_date,current_date)->'recuperaveis' as n", [A]), [{ n: 0 }]);
    } finally { await db.exec("rollback"); }
  });
  await check("delta consolidado reconcilia drift hospedado, grants por coluna e defaults futuros sem regredir PR169",async()=>{
    const delta=await readFile(new URL("20261022170000_reconcile_hosted_security.sql",dir),"utf8");
    await db.exec("begin");
    try {
      await db.exec(`grant truncate on all tables in schema public to authenticated;
        grant select(wts_api_token,digisac_token,digisac_url) on clients to public,anon,authenticated;
        grant update(reach,client_id) on instagram_posts to authenticated;
        grant update(rationale,client_id) on content_angle_suggestions to authenticated;
        alter default privileges in schema public grant all on tables to anon,authenticated;
        create schema untouched_extension;
        alter default privileges in schema untouched_extension grant truncate on tables to authenticated;
        create function public.secure_path_fixture() returns text language sql security definer set search_path='' as $$select 'safe'$$;
        create function public.extension_path_fixture() returns text language sql security definer set search_path=public,untouched_extension,pg_temp as $$select 'extension'$$;
        revoke all on function public.secure_path_fixture(),public.extension_path_fixture() from public,anon;`);
      await db.exec(delta);
      await db.exec(delta); // Reaplicável no catálogo já corrigido.
      assert.deepEqual(await rows("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege('authenticated',oid,'TRUNCATE')"),[]);
      assert.deepEqual(await rows(`select has_column_privilege('authenticated','public.instagram_posts','reach','UPDATE') as metric,
        has_column_privilege('authenticated','public.content_angle_suggestions','rationale','UPDATE') as rationale,
        has_column_privilege('authenticated','public.clients','digisac_url','SELECT') as internal,
        has_column_privilege('authenticated','public.clients','ticket_medio','SELECT') as ticket`),[{metric:false,rationale:false,internal:false,ticket:true}]);
      assert.deepEqual(await rows("select proconfig from pg_proc where oid='public.secure_path_fixture()'::regprocedure"),[{proconfig:['search_path=""']}]);
      assert.deepEqual(await rows("select proconfig from pg_proc where oid='public.extension_path_fixture()'::regprocedure"),[{proconfig:['search_path=public, untouched_extension, pg_temp']}]);
      assert.deepEqual(await rows(`select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc
        where pronamespace='public'::regnamespace and oid::regprocedure::text=any($1)
          order by 1`,[operationalSignatures.map(r=>r.signature)]),operationalSignatures);
      await db.exec("create table public.future_acl_fixture(id integer);create table untouched_extension.future_acl_fixture(id integer)");
      assert.deepEqual(await rows(`select has_table_privilege('authenticated','public.future_acl_fixture','TRUNCATE') as public_truncate,
        has_table_privilege('anon','public.future_acl_fixture','SELECT') as public_anon,
        has_table_privilege('authenticated','untouched_extension.future_acl_fixture','TRUNCATE') as other_schema`),[{public_truncate:false,public_anon:false,other_schema:true}]);
    } finally {await db.exec("rollback");}
  });
  await check("delta hospedado aborta diante de RPC mais nova desconhecida",async()=>{
    await db.exec("begin");
    try {
      await db.exec(`create or replace function public.definir_ticket_cliente(p_client uuid,p_valor numeric) returns void
        language plpgsql as $$begin raise exception 'fixture de contrato futuro';end$$`);
      const delta=await readFile(new URL("20261022170000_reconcile_hosted_security.sql",dir),"utf8");
      await assert.rejects(()=>db.exec(delta),/Contrato não revisado: public.definir_ticket_cliente/);
    } finally {await db.exec("rollback");}
  });
  await check("preflight e contagens legadas executam somente leitura sem expor dados", async () => {
    const preflight = await readFile(new URL("../supabase/audits/preflight.sql", import.meta.url), "utf8");
    const reports = await execRows(preflight);
    const environment = reports.find((row) => row.section === "environment");
    assert.equal(environment?.transaction_read_only, "on");
    assert.equal(environment?.transaction_isolation, "repeatable read");
    const manifest = reports.find((row) => row.section === "migration_manifest_note");
    assert.equal(manifest?.repository_sql_files, files.length);
    assert.equal(manifest?.repository_distinct_versions, new Set(files.map((file) => file.split("_")[0])).size);
    assert.deepEqual(reports.find((row) => row.section === "security_summary"), {
      section: "security_summary", tables_without_rls: 0, anonymous_relations: 0, views_without_invoker: 0,
      anonymous_functions: 0, unsafe_definer_paths: 0, authenticated_truncate_tables: 0,
    });
    const history = reports.find((row) => row.section === "migration_history");
    assert.equal(history?.history_exists, false, "histórico ausente deve ser reportado sem abortar");
    assert.equal(history?.history_count_sql, null);
    assert.ok(reports.filter((row) => row.section === "required_function").every((row) => row.present === true));
    assert.ok(reports.filter((row) => row.section === "table_security").every((row) => row.rls_enabled === true && row.anon_has_access === false && row.authenticated_can_truncate === false));
    assert.ok(reports.filter((row) => row.section === "view_security").every((row) => row.security_invoker === true && row.anon_can_read === false));
    assert.ok(reports.filter((row) => row.section === "function_security").every((row) => row.trusted_search_path === true && row.anon_can_execute === false));
    assert.ok(reports.filter((row) => row.section === "column_security").every((row) => row.authenticated_select === row.expected_authenticated_select && row.anon_has_access === false));
    assert.equal(reports.filter((row) => row.section === "unvalidated_constraint").length, invalidRelations.length + 1);
    assert.ok(reports.some((row) => row.section === "anonymous_default_grant" && row.default_source === "global_implicit" && row.object_type === "f" && row.grantee === "PUBLIC"), "default global implícito precisa ser visível");
    const generated = reports.filter((row) => row.section === "tenant_violation_query");
    assert.equal(generated.length, invalidRelations.length);
    for (const query of generated) {
      assert.equal(query.supported_match_simple, true);
      assert.equal(typeof query.count_sql, "string");
      const counts = await execRows<{ constraint_name: string; legacy_violations: number }>(query.count_sql as string);
      assert.deepEqual(counts, [{ constraint_name: query.constraint_name, legacy_violations: query.constraint_name === "mensagens_conversa_id_tenant_fk" ? 1 : 0 }]);
    }
    const serialized = JSON.stringify(reports);
    for (const privateValue of ["fake-token", "fake-secret", "fake-wts", "fake-digisac", "Pessoa A", "Pessoa B", "Mensagem A", "Mensagem B", "MENSAGEM DE OUTRO TENANT", "fixture@example.test"]) assert.equal(serialized.includes(privateValue), false);
    await db.exec("begin read only");
    try { await denied(() => db.query("update clients set name='preflight must never write' where id=$1", [A]), "25006"); }
    finally { await db.exec("rollback"); }
    assert.equal((await rows("select * from mensagens where externo_id='legacy-mismatch'")).length, 1);
  });
  await check("validação explícita detecta só a inconsistência legada sem apagar dados", async () => {
    const constraints = await db.query<{ table_name: string; constraint_name: string }>("select conrelid::regclass::text as table_name,conname as constraint_name from pg_constraint where conname like '%_tenant_fk' and connamespace='public'::regnamespace");
    assert.equal(constraints.rows.length, invalidRelations.length);
    for (const constraint of constraints.rows) {
      const validate = () => db.exec(`alter table ${constraint.table_name} validate constraint ${constraint.constraint_name}`);
      if (constraint.constraint_name === "mensagens_conversa_id_tenant_fk") await denied(validate, "23503");
      else await validate();
    }
    assert.equal((await rows("select * from mensagens where externo_id='legacy-mismatch'")).length, 1);
  });
  await check("preflight detecta EXECUTE anônimo implícito em função inofensiva da fixture", async () => {
    await db.exec("create function public.preflight_implicit_grant_fixture() returns boolean language sql immutable as $$ select true $$");
    try {
      assert.deepEqual(await rows("select has_function_privilege('anon','public.preflight_implicit_grant_fixture()','EXECUTE') as allowed"), [{ allowed: true }]);
      const preflight = await readFile(new URL("../supabase/audits/preflight.sql", import.meta.url), "utf8");
      const reports = await execRows(preflight);
      assert.equal(reports.find((row) => row.section === "environment")?.transaction_read_only, "on");
      assert.equal(reports.find((row) => row.section === "security_summary")?.anonymous_functions, 1);
      const exposed = reports.find((row) => row.section === "function_security" && String(row.signature).includes("preflight_implicit_grant_fixture"));
      assert.equal(exposed?.anon_can_execute, true);
      assert.ok(reports.some((row) => row.section === "anonymous_default_grant" && row.default_source === "global_implicit" && row.object_type === "f" && row.grantee === "PUBLIC"));
    } finally { await db.exec("drop function public.preflight_implicit_grant_fixture()"); }
  });
  await check("estado final bloqueia toda função public para anon, incluindo migrações novas", async () => {
    assert.deepEqual(await rows("select oid::regprocedure::text as signature from pg_proc where pronamespace='public'::regnamespace and prokind='f' and has_function_privilege('anon',oid,'EXECUTE')"), []);
  });
  console.log(`test-db-security: ok (${checks} cenários; ${files.length} migrações; anon, viewer, editor, admin, service_role; ${invalidRelations.length} relações entre tenants)`);
} finally { await db.close(); }
