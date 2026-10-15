import { createFileRoute } from "@tanstack/react-router";
import { OnboardingSap } from "@/components/sap-onboarding";

// Sistema de Aquisição · Ficha do Cliente (02.06) e Checklist de Dados e Acessos (02.05).
export const Route = createFileRoute("/_authenticated/sap/$clientId/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { clientId } = Route.useParams();
  return <OnboardingSap clientId={clientId} />;
}
