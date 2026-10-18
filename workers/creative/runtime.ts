import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreativeJob } from "../../src/lib/creative-intelligence/contracts.js";

export class CreativeError extends Error {
  constructor(
    public code: string,
    message: string,
    public retry = false,
  ) {
    super(message);
  }
}
export function requireSecret(name: string) {
  const value = process.env[name];
  if (
    !value ||
    value === "[SENSITIVE]" ||
    /^(replace|your_|changeme)/i.test(value)
  )
    throw new CreativeError(
      "MISSING_CONFIGURATION",
      `${name} precisa ser configurada no worker.`,
    );
  return value;
}
export function createAdmin(): SupabaseClient {
  const url = new URL(requireSecret("SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
  )
    throw new CreativeError("INVALID_ENVIRONMENT", "Projeto Supabase inválido");
  // Proteção explícita contra execução acidental na produção do Nexo.
  if (url.hostname === "cvdnzoqduliopscfsrkc.supabase.co")
    throw new CreativeError(
      "PRODUCTION_LOCKED",
      "Este worker de homologação não executa na produção. A liberação exige uma entrega aprovada separadamente.",
    );
  const key = requireSecret("SUPABASE_SERVICE_ROLE_KEY");
  if (key.startsWith("ey")) {
    let payload: { ref?: string; role?: string };
    try {
      payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
    } catch {
      throw new CreativeError("INVALID_ENVIRONMENT", "Chave Supabase inválida");
    }
    if (
      payload.ref !== url.hostname.split(".")[0] ||
      payload.role !== "service_role"
    )
      throw new CreativeError(
        "INVALID_ENVIRONMENT",
        "A chave de serviço não pertence ao projeto configurado",
      );
  }
  return createClient(url.href, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function checked<T>(
  request: PromiseLike<{
    data: T;
    error: { message: string; code?: string } | null;
  }>,
): Promise<T> {
  const { data, error } = await request;
  if (error)
    throw new CreativeError(
      "DATABASE_ERROR",
      "Falha ao persistir ou ler o trabalho de Inteligência Criativa.",
      true,
    );
  return data;
}
export class JobContext {
  readonly controller = new AbortController();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private progress = 1;
  private message = "Iniciando";
  constructor(
    readonly admin: SupabaseClient,
    readonly job: CreativeJob,
  ) {}
  get signal() {
    return this.controller.signal;
  }
  async beat(progress = this.progress, message = this.message) {
    this.signal.throwIfAborted();
    this.progress = progress;
    this.message = message;
    const ok = await checked(
      this.admin.rpc("creative_heartbeat", {
        p_job_id: this.job.id,
        p_lease: this.job.lease_token,
        p_progress: progress,
        p_message: message,
      }),
    );
    if (!ok) {
      this.controller.abort();
      throw new CreativeError(
        "LEASE_LOST",
        "Trabalho cancelado ou reservado por outro worker",
      );
    }
  }
  start() {
    this.heartbeatTimer = setInterval(() => {
      void this.beat().catch(() => this.controller.abort());
    }, 30_000);
  }
  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
  async reserve(key: string, model: string, phase: string, ceiling: number) {
    await this.beat();
    return checked(
      this.admin.rpc("creative_reserve_cost", {
        p_job_id: this.job.id,
        p_lease: this.job.lease_token,
        p_request_key: `${this.job.attempts}:${key}`,
        p_model: model,
        p_phase: phase,
        p_ceiling: ceiling,
      }),
    ) as Promise<string>;
  }
  async settle(id: string, cost: number, usage: Record<string, unknown>) {
    const ok = await checked(
      this.admin.rpc("creative_settle_cost", {
        p_usage_id: id,
        p_cost: cost,
        p_usage: usage,
      }),
    );
    if (!ok)
      throw new CreativeError(
        "COST_NOT_RECORDED",
        "Não foi possível confirmar o custo da chamada",
      );
    if (cost > this.job.budget_usd)
      throw new CreativeError(
        "BUDGET_EXCEEDED",
        "Custo superior ao orçamento do trabalho",
      );
  }
  async finish(output: Record<string, unknown>) {
    await this.beat(99, "Salvando resultado e evidências");
    const ok = await checked(
      this.admin.rpc("creative_finish", {
        p_job_id: this.job.id,
        p_lease: this.job.lease_token,
        p_output: output,
      }),
    );
    if (!ok)
      throw new CreativeError(
        "LEASE_LOST",
        "Resultado não publicado: o trabalho perdeu a reserva",
      );
  }
}
