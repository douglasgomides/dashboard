/** A recarga automática só é segura se a marca sobreviver à navegação. */
export function createDeployRecovery(storage: Pick<Storage, "getItem" | "setItem">, now = Date.now) {
  let attempted = false;
  return () => {
    if (attempted) return false;
    attempted = true;
    try {
      const last = Number(storage.getItem("recarga-por-deploy") ?? 0);
      if (Number.isFinite(last) && now() - last < 60_000) return false;
      storage.setItem("recarga-por-deploy", String(now()));
      return true;
    } catch {
      // Sem armazenamento, deixa o erro chegar à tela de recuperação manual.
      return false;
    }
  };
}
