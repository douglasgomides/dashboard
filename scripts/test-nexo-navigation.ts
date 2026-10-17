import assert from "node:assert/strict";
import { loginDestination } from "../src/lib/login-destination";

const origin="https://nexo.doctorcreator.com.br";
assert.equal(loginDestination("/admin?tab=agentes#revisao",origin),"/admin?tab=agentes#revisao");
assert.equal(loginDestination("/clinica/conteudo?preset=30d",origin),"/clinica/conteudo?preset=30d");
for(const target of [undefined,"https://example.test/","//example.test/","/\\example.test/","/login","/login?redirect=/admin","/\nexample.test/"]){
  assert.equal(loginDestination(target,origin),null,String(target));
}
console.log("Login destinations preserve internal paths and reject external or looping targets.");
