import { createFileRoute } from "@tanstack/react-router";
import { Acompanhamento } from "@/components/acompanhamento";
export const Route = createFileRoute("/_authenticated/admin/acompanhamento")({ component: Acompanhamento });
