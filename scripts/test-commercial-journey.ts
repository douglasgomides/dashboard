import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  qualidadeComercialSchema,
  eventosComerciaisSchema,
  saudeFonteComercial,
} from "../src/lib/jornada-comercial.js";

// Banco descartável e sem rede. Fixtures são exclusivamente testes de contrato;
// a homologação real é registrada separadamente, nunca substituída por elas.
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1),
  B = id(2),
  SAP = id(3),
  viewer = id(4),
  other = id(5),
  sapUser = id(6);
const conn = id(10),
  kommo = id(11),
  otherConn = id(12),
  sapConn = id(13);
const lead = id(20),
  lead2 = id(21),
  legacy = id(22),
  foreignLead = id(23),
  kLead = id(24),
  kLead2 = id(25);
const conv = id(30),
  kConv = id(31),
  foreignConv = id(32);
let checks = 0;
const rows = async <T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) => (await db.query<T>(sql, args)).rows;
const scalar = async (sql: string, args: unknown[] = []) =>
  (await rows<{ r: any }>(sql, args))[0].r;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    checks++;
  } catch (cause) {
    throw new Error(name, { cause });
  }
}
async function role<T>(
  user: string | null,
  name: string,
  fn: () => Promise<T>,
) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: name, ...(user ? { sub: user } : {}) }),
    ]);
    await db.exec(`set local role ${name}`);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}
const rejected = (fn: () => Promise<unknown>, code = "42501") =>
  assert.rejects(fn(), (e: any) => e.code === code);
const register = (payload: unknown) =>
  scalar("select jornada_registrar_vinculos($1,$2) r", [
    A,
    JSON.stringify(payload),
  ]);
const link = {
  lead_id: lead,
  conversa_id: conv,
  metodo: "flwchat_session",
  referencia_externa: "session-real-key",
};
const quality = (client = A) =>
  scalar("select jornada_qualidade($1,'2026-10-01','2026-10-31') r", [client]);
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(`begin;${await readFile(new URL(f, dir), "utf8")}commit;`);
    } catch (cause) {
      throw new Error(f, { cause });
    }
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  for (const c of [A, B, SAP])
    await db.query(
      "insert into clients(id,name) values($1,'Clínica fixture')",
      [c],
    );
  for (const u of [viewer, other, sapUser])
    await db.query(
      "insert into auth.users(id,email) values($1,'fixture@example.test')",
      [u],
    );
  for (const [c, u] of [
    [A, viewer],
    [B, other],
    [SAP, sapUser],
  ])
    await db.query(
      "insert into client_members(client_id,user_id,role) values($1,$2,'viewer')",
      [c, u],
    );
  await db.query(
    "insert into cliente_modulos(client_id,modulo,status) values($1,'sap','ativo')",
    [SAP],
  );
  for (const [c, cc, p] of [
    [A, conn, "flwchat"],
    [A, kommo, "kommo"],
    [B, otherConn, "kommo"],
    [SAP, sapConn, "kommo"],
  ])
    await db.query(
      "insert into crm_connections(id,client_id,provider) values($1,$2,$3)",
      [cc, c, p],
    );
  for (const [c, cc, l, p, external, raw] of [
    [A, conn, lead, "flwchat", "card1", { sessionId: "session-real-key" }],
    [A, conn, lead2, "flwchat", "card2", {}],
    [A, conn, legacy, "flwchat", "legacy", {}],
    [B, otherConn, foreignLead, "kommo", "card1", {}],
    [A, kommo, kLead, "kommo", "k1", {}],
    [A, kommo, kLead2, "kommo", "k2", {}],
  ]) {
    await db.query(
      "insert into crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,outcome,occurred_at,contact_name,contact_phone) values($1,$2,$3,$4,$5,'add',$6,'open','2026-10-10T12:00:00Z','NOME_SENSIVEL','+5585999991234')",
      [l, c, cc, p, external, JSON.stringify(raw)],
    );
  }
  for (const [c, cv, p, external] of [
    [A, conv, "wts", "session-real-key"],
    [A, kConv, "kommo", "talk-key"],
    [B, foreignConv, "kommo", "talk-key"],
  ])
    await db.query(
      "insert into conversas(id,client_id,provider,externo_id,iniciada_em) values($1,$2,$3,$4,'2026-10-10T13:00:00Z')",
      [cv, c, p, external],
    );
  await db.query("update conversas set source_connection_id=$1 where id=$2", [
    kommo,
    kConv,
  ]);
  await db.query(
    "insert into wts_sessions(client_id,session_id,started_at,source_provider) values($1,'session-real-key','2026-10-10T13:00:00Z','wts')",
    [A],
  );
  for (const cv of [conv, kConv])
    await db.query(
      "insert into mensagens(client_id,conversa_id,direcao,enviada_em,externo_id,texto) values($1,$2,'saida','2026-10-10T13:01:00Z','msg-key','CONTEUDO_CLINICO_SENSIVEL')",
      [A, cv],
    );
  await check(
    "sessão exata e mesma clínica, sem fusão por nome/telefone",
    async () => {
      assert.deepEqual(await register([link]), {
        verificados: 1,
        conflitos: 0,
      });
      assert.equal(
        await scalar("select count(*)::integer r from jornada_vinculos"),
        1,
      );
      const r = await role(viewer, "authenticated", quality);
      qualidadeComercialSchema.parse(r);
      assert.equal(r.resumo.com_conversa_verificada, 1);
      assert.equal(r.resumo.registros_crm, 5);
      assert.equal(r.resumo.comparecimentos, null);
      assert.equal(r.resumo.receita_recebida, null);
      assert.equal(r.resumo.receita_atribuida, null);
    },
  );
  await check("idempotência preserva um vínculo e uma trilha", async () => {
    await register([link]);
    assert.equal(
      await scalar(
        "select count(*)::integer r from jornada_vinculos_auditoria",
      ),
      1,
    );
    await scalar("select jornada_reconciliar($1) r", [A]);
    assert.equal(
      await scalar("select count(*)::integer r from jornada_vinculos"),
      1,
    );
  });
  await check(
    "identificador entre clínicas é rejeitado até para service_role",
    async () => {
      await rejected(
        () => register([{ ...link, lead_id: foreignLead }]),
        "22023",
      );
      await rejected(
        () =>
          role(null, "service_role", () =>
            rows(
              "insert into jornada_vinculos(client_id,conversa_id,lead_id,crm_connection_id,lead_externo_id,conversa_externo_id,metodo,referencia_externa) values($1,$2,$3,$4,'x','y','kommo_evento','m')",
              [A, foreignConv, lead, conn],
            ),
          ),
        "23503",
      );
    },
  );
  await check("viewer lê só sua clínica e não altera evidências", async () => {
    assert.equal(
      (
        await role(viewer, "authenticated", () =>
          rows("select * from jornada_vinculos"),
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await role(other, "authenticated", () =>
          rows("select * from jornada_vinculos"),
        )
      ).length,
      0,
    );
    await rejected(() => role(viewer, "authenticated", () => quality(B)));
    await rejected(() => role(viewer, "authenticated", () => register([link])));
    await rejected(() =>
      role(viewer, "authenticated", () => rows("delete from jornada_vinculos")),
    );
    await rejected(() => role(null, "anon", () => quality()));
    await rejected(() => role(sapUser, "authenticated", () => quality(SAP)));
  });
  await check(
    "evidência ambígua e mudanças de identidade não viram confirmação",
    async () => {
      await db.query("update crm_leads set raw_payload=$1 where id=$2", [
        JSON.stringify({ sessionId: "session-real-key" }),
        lead2,
      ]);
      await rejected(() => register([link]), "22023");
      assert.equal(
        (await role(viewer, "authenticated", quality)).resumo
          .com_conversa_verificada,
        0,
      );
      await db.query("update crm_leads set raw_payload='{}' where id=$1", [
        lead2,
      ]);
      await rejected(
        () =>
          db.query(
            "update wts_sessions set source_provider=null where client_id=$1",
            [A],
          ),
        "23514",
      );
      await db.query("update crm_leads set raw_payload='{}' where id=$1", [
        lead,
      ]);
      assert.equal(
        (await role(viewer, "authenticated", quality)).resumo
          .com_conversa_verificada,
        0,
      );
      await db.query("update crm_leads set raw_payload=$1 where id=$2", [
        JSON.stringify({ sessionId: "session-real-key" }),
        lead,
      ]);
    },
  );
  await check(
    "evento do provedor exige mensagem e referências exatas",
    async () => {
      const k = {
        lead_id: kLead,
        conversa_id: kConv,
        metodo: "kommo_evento",
        lead_externo_id: "k1",
        conversa_externo_id: "talk-key",
        referencia_externa: "inexistente",
      };
      await rejected(() => register([k]), "22023");
      k.referencia_externa = "msg-key";
      await register([k]);
      await register([{ ...k, lead_id: kLead2, lead_externo_id: "k2" }]);
      assert.equal(
        await scalar(
          "select estado r from jornada_vinculos where conversa_id=$1",
          [kConv],
        ),
        "conflito",
      );
      await register([k]);
      assert.equal(
        await scalar(
          "select estado r from jornada_vinculos where conversa_id=$1",
          [kConv],
        ),
        "conflito",
      );
      assert.equal(
        (await role(viewer, "authenticated", quality)).resumo
          .com_conversa_verificada,
        1,
      );
    },
  );
  await check(
    "linha do tempo é minimizada, auditada e sem duplicar entrada",
    async () => {
      const r = await role(viewer, "authenticated", () =>
        scalar("select jornada_eventos_comerciais($1,$2) r", [A, lead]),
      );
      eventosComerciaisSchema.parse(r);
      assert.equal(
        r.eventos.filter(
          (e: any) => e.tipo === "entrou" || e.tipo === "entrada_crm",
        ).length,
        1,
      );
      assert.equal(
        r.eventos.filter((e: any) => e.tipo === "primeira_saida_observada")
          .length,
        1,
      );
      assert.doesNotMatch(
        JSON.stringify(r),
        /NOME_SENSIVEL|CONTEUDO_CLINICO|999991234/,
      );
      assert.equal(
        await role(viewer, "authenticated", () =>
          scalar("select jornada_eventos_comerciais($1,$2) r", [
            A,
            foreignLead,
          ]),
        ),
        null,
      );
    },
  );
  await check(
    "recebimento não é faturamento e ganho não é agendamento",
    async () => {
      await db.query(
        "update crm_leads set outcome='won',price=1200 where id=$1",
        [lead],
      );
      const r = await role(viewer, "authenticated", quality);
      assert.equal(r.resumo.valor_negocios_ganhos, 1200);
      assert.equal(r.resumo.sinal_agendamento_crm, 0);
      assert.equal(r.resumo.receita_faturada, null);
      assert.equal(r.resumo.sem_origem, 5);
      assert.notEqual(saudeFonteComercial(r.fontes[0]), "Saudável");
    },
  );
  await check("período inválido, paginação e soft-delete", async () => {
    await rejected(
      () =>
        role(viewer, "authenticated", () =>
          scalar("select jornada_qualidade($1,'2026-10-10','2026-10-01') r", [
            A,
          ]),
        ),
      "22023",
    );
    const p = await role(viewer, "authenticated", () =>
      scalar("select jornada_qualidade($1,'2026-10-01','2026-10-31',20) r", [
        A,
      ]),
    );
    assert.equal(p.registros.length, 0);
    assert.equal(p.paginacao.total, 5);
    await db.query(
      "update crm_leads set removido_na_origem=now() where id=$1",
      [lead],
    );
    assert.equal(
      (await role(viewer, "authenticated", quality)).resumo
        .com_conversa_verificada,
      0,
    );
  });
  await check(
    "Digisac exige ticket, contato e conexão exatos, sem cruzar provedores",
    async () => {
      const dc = id(50),
        dl = id(51),
        dv = id(52);
      await db.query(
        "insert into crm_connections(id,client_id,provider) values($1,$2,'digisac')",
        [dc, A],
      );
      await db.query(
        "insert into crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,raw_payload,occurred_at) values($1,$2,$3,'digisac','contact-key','add','{}','2026-10-10T12:00:00Z')",
        [dl, A, dc],
      );
      await db.query(
        "insert into conversas(id,client_id,provider,externo_id,source_connection_id) values($1,$2,'digisac','ticket-key',$3)",
        [dv, A, dc],
      );
      await db.query(
        "insert into wts_sessions(client_id,session_id,started_at,source_provider,source_connection_id,contact_id) values($1,'ticket-key',now(),'digisac',$2,'contact-key')",
        [A, dc],
      );
      const d = {
        lead_id: dl,
        conversa_id: dv,
        metodo: "digisac_ticket",
        referencia_externa: "ticket-key",
      };
      assert.equal((await register([d])).verificados, 1);
      await rejected(
        () =>
          db.query("update conversas set source_connection_id=$1 where id=$2", [
            kommo,
            dv,
          ]),
        "23514",
      );
      await rejected(
        () =>
          db.query(
            "insert into wts_sessions(client_id,session_id,started_at,source_provider,source_connection_id) values($1,'foreign-ticket',now(),'digisac',$2)",
            [A, otherConn],
          ),
        "23503",
      );
      await db.query(
        "update wts_sessions set contact_id='different' where client_id=$1 and session_id='ticket-key'",
        [A],
      );
      await rejected(() => register([d]), "22023");
      assert.equal(
        await scalar(
          "select count(*)::integer r from jornada_vinculos_validos where conversa_id=$1",
          [dv],
        ),
        0,
      );
    },
  );
  console.log(
    `test-commercial-journey: ${checks} cenários de integração PostgreSQL/RLS passaram`,
  );
} finally {
  await db.close();
}
