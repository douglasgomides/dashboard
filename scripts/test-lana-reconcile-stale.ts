import assert from 'node:assert/strict';
import { runKommoReconcile } from '../api/_lib/kommo-reconcile';
const original=globalThis.fetch;
let status='112594163'; let writes=0;
globalThis.fetch=async(input, init)=>{
 const u=new URL(String(input));
 if(u.hostname==='clinic.kommo.com') {
  if(u.pathname.endsWith('/unsorted')) return new Response(null,{status:204});
  return Response.json({_embedded:{leads:[{id:1,status_id:110392435,pipeline_id:12944487,price:0,source_id:77,_embedded:{contacts:[{id:9}]}}]}});
 }
 if((init?.method??'GET')!=='GET'){writes++;return Response.json(null);}
 return Response.json([{external_lead_id:'1',status_id:status,pipeline_id:'12944487',removido_na_origem:null,canal_id:null,contatos:null}]);
};
try {
 const env={accessToken:'fake',kommoDomain:'clinic.kommo.com',supabaseUrl:'https://review.supabase.co',supabaseServiceRoleKey:'fake',crmConnectionId:'connection',clientId:'client'};
 let r=await runKommoReconcile(env);
 assert.equal(r.divergenciasEtapa?.length,1);
 assert.ok(r.errors.some(x=>x.includes('etapas divergentes')));
 assert.equal(writes,0,'não sobrescrever etapa histórica ao completar contato');
 status='110392435';r=await runKommoReconcile(env);
 assert.equal(r.divergenciasEtapa?.length,0);assert.equal(r.errors.length,0);
 assert.equal(r.completados,1);assert.equal(writes,1);
 console.log('PASS: divergência detectada, histórico preservado, enriquecimento normal mantido');
} finally {globalThis.fetch=original;}
