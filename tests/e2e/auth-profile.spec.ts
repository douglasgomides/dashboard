import { test, expect } from "@playwright/test";
import { CID, client, mockAccount } from "./fixtures";

test("login rejects a normalized protocol-relative destination and keeps the current product entry", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  const destinations: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) destinations.push(request.url());
  });
  const search = new URLSearchParams({ redirect: "/a/..//external.invalid", acesso: "equipe" });
  await page.goto(`/login?${search}`);
  await expect(page.getByText("Equipe interna / Nexo", { exact: true })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("qa@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fictional-password");
  await page.getByRole("button", { name: "Entrar no Nexo", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${CID}(?:\\?|$)`));
  expect(destinations.every((url) => new URL(url).hostname !== "external.invalid")).toBe(true);
});

test("an expired recovery link offers a way back instead of loading forever", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  await page.goto("/reset-password");
  await expect(page.getByRole("alert")).toContainText("Este link é inválido ou expirou.");
  await expect(page.getByText("Abrindo o link de redefinição…", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar nova senha", exact: true })).not.toBeVisible();
  await page.getByRole("link", { name: "Voltar para entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar no Nexo", exact: true })).toBeVisible();
});

for (const failSave of [false, true]) {
  test(`avatar upload ${failSave ? "rolls back the new object when saving fails" : "preserves unsaved profile fields and replaces the old object after saving"}`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    const original = `http://localhost:9/storage/v1/object/public/client-avatars/${CID}/original.png`;
    let avatar = original;
    const writes: Record<string, unknown>[] = [];
    const deleted: string[][] = [];
    const events: string[] = [];
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3n0AAAAASUVORK5CYII=", "base64");
    await context.route("**/rest/v1/clients?**", (route) => {
      if (route.request().method() === "PATCH") {
        events.push("save-profile");
        const input = route.request().postDataJSON();
        writes.push(input);
        if (failSave) return route.fulfill({ status: 403, json: { message: "simulated private database failure" } });
        avatar = input.avatar_url;
        return route.fulfill({ status: 204 });
      }
      const record = { ...client, avatar_url: avatar };
      const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
      return route.fulfill({ json: single ? record : [record] });
    });
    await context.route("**/storage/v1/**", (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ body: png, contentType: "image/png" });
      if (request.method() === "DELETE") {
        events.push("delete-object");
        deleted.push(request.postDataJSON().prefixes);
        return route.fulfill({ json: [] });
      }
      events.push("upload-object");
      const path = new URL(request.url()).pathname.split("/object/")[1];
      return route.fulfill({ json: { Key: path, Id: "44444444-4444-4444-8444-444444444444" } });
    });
    await page.goto(`/admin/${CID}`);
    const profile = page.locator("section").filter({ has: page.getByRole("heading", { name: "Perfil do cliente", exact: true }) });
    const name = profile.getByRole("textbox").first();
    await name.fill("Rascunho ainda não salvo");
    await profile.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    if (failSave) {
      await expect(profile.getByRole("alert")).toHaveText("Não foi possível atualizar a foto. Verifique sua conexão e tente novamente.");
      await expect(profile).not.toContainText(/\[object Object\]|simulated private database failure/);
    } else {
      await expect(profile.getByText("Foto atualizada.", { exact: true })).toBeVisible();
    }
    await expect(name).toHaveValue("Rascunho ainda não salvo");
    expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0])).toEqual(["avatar_url"]);
    const uploaded = String(writes[0].avatar_url).split("/client-avatars/")[1];
    expect(uploaded).toMatch(new RegExp(`^${CID}/[a-f0-9-]+\\.png$`));
    expect(deleted).toEqual([[failSave ? uploaded : `${CID}/original.png`]]);
    expect(events).toEqual(["upload-object", "save-profile", "delete-object"]);
    expect(avatar).toBe(failSave ? original : writes[0].avatar_url);
  });
}
