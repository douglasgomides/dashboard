import { useEffect, useId, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { AlertaDaCarteira } from "@/lib/carteira-urgencia";
import type { BarraDoFato } from "@/lib/leitura/tipos";
import { ROTULO_FAIXA, type NotaFontes } from "@/lib/nota-fontes";
import { AdmChip } from "./admin-base";
import { NxBarras } from "./cartoes";
import "@/styles/nexo-carteira-urgencia.css";

// Painel lateral de UMA clínica da Carteira (Phase 03.1.1.1, D-07): a nota das fontes explicada em barras feitas só do que a nota usou,
// os problemas abertos com quem resolve cada um e os links de sempre. Só apresentação: recebe tudo pronto, não busca, não grava e não
// envia nada (D-04, D-05: sem botão de "resolvido", "avisar" ou "criar tarefa"; só links que navegam). A nota é a SAÚDE DOS DADOS, nunca
// o resultado da clínica (I-1). Dialog nativo (o mesmo padrão do funil desenhado): Esc e o fundo fecham, o corpo não rola enquanto aberto.

export interface NumeroDoPainel {
  rotulo: string;
  valor: string;
  /** A variação da PRÓPRIA clínica contra os 30 dias anteriores, a mesma da linha. null = base pequena: "Falta dado". */
  delta: { t: string; c: string } | null;
}

export interface NxPainelDaClinicaProps {
  clinica: { id: string; nome: string; sub: string } | null;
  nota: NotaFontes | null;
  fatores: readonly BarraDoFato[];
  alertas: readonly AlertaDaCarteira[];
  numeros: readonly NumeroDoPainel[];
  aberto: boolean;
  /** Fecha o painel (Esc, ✕, fundo). Quem abriu devolve o foco ao botão que abriu. */
  aoFechar: () => void;
}

/** O anel pequeno da nota: arco de 0 a 100, a cor vem do atributo (verde, amarelo, vermelho) e a palavra da faixa vai ao lado. */
function Anel({ nota, cor }: { nota: number | null; cor: string }) {
  return (
    <span className="nx-painel-clinica__anel" data-cor={cor} aria-hidden>
      <svg viewBox="0 0 48 48">
        <circle className="nx-painel-clinica__anel-fundo" cx="24" cy="24" r="20" fill="none" strokeWidth="5" />
        {nota != null && <circle className="nx-painel-clinica__anel-arco" cx="24" cy="24" r="20" fill="none" strokeWidth="5" strokeLinecap="round" pathLength={100} strokeDasharray={`${nota} 100`} />}
      </svg>
      <b>{nota ?? "–"}</b>
    </span>
  );
}

export function NxPainelDaClinica({ clinica, nota, fatores, alertas, numeros, aberto, aoFechar }: NxPainelDaClinicaProps) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const aberta = aberto && clinica != null;

  // Abre e fecha o dialog nativo. O corpo da página não rola enquanto o painel está aberto e volta ao que era ao fechar.
  useEffect(() => {
    const dialog = dialogo.current;
    if (!dialog) return;
    if (aberta) {
      if (!dialog.open) dialog.showModal();
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = overflow;
      };
    }
    if (dialog.open) dialog.close();
  }, [aberta]);

  const temNota = nota != null && nota.nota != null;
  const cor = temNota ? nota.cor : "cinza";
  const faixa = temNota && nota.faixa ? ROTULO_FAIXA[nota.faixa] : "Ainda sem nota";

  return (
    <dialog
      ref={dialogo}
      className="nx-painel-clinica"
      aria-labelledby={`${id}-nome`}
      onClose={aoFechar}
      onClick={(ev) => {
        // O clique no fundo (::backdrop) chega com o próprio dialog como alvo.
        if (ev.target === ev.currentTarget) dialogo.current?.close();
      }}
    >
      {clinica && (
        <div className="nx-painel-clinica__corpo">
          <button type="button" className="nx-painel-clinica__fechar" aria-label="Fechar o painel" onClick={() => dialogo.current?.close()}>
            ✕
          </button>
          <header className="nx-painel-clinica__topo">
            <h3 id={`${id}-nome`} className="nx-painel-clinica__nome">
              {clinica.nome}
            </h3>
            <p className="nx-painel-clinica__sub" title={clinica.sub}>
              {clinica.sub}
            </p>
          </header>

          <section className="nx-painel-clinica__nota" aria-label="Nota das fontes" data-cor={cor}>
            <Anel nota={temNota ? nota.nota : null} cor={cor} />
            <div>
              <p className="nx-painel-clinica__faixa">{faixa}</p>
              <p className="nx-painel-clinica__legenda">Saúde dos dados da clínica (nota das fontes). Não é o resultado dela.</p>
            </div>
          </section>

          <section aria-label="Últimos 30 dias da clínica">
            <h4 className="nx-painel-clinica__titulo">Últimos 30 dias da clínica</h4>
            <ul className="nx-painel-clinica__numeros">
              {numeros.map((n) => (
                <li key={n.rotulo}>
                  <b>{n.valor}</b>
                  <span>{n.rotulo}</span>
                  <i data-sentido={n.delta?.c ?? "falta"} aria-label={n.delta ? `${n.delta.t.replace("▲", "subiu").replace("▼", "caiu")} contra os 30 dias anteriores` : "Falta dado contra os 30 dias anteriores"}>
                    {n.delta?.t ?? "Falta dado"}
                  </i>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Por que a nota é essa">
            <h4 className="nx-painel-clinica__titulo">{temNota ? `Por que ${nota.nota}?` : "Por que não tem nota?"}</h4>
            {fatores.length > 0 ? <NxBarras barras={fatores} rotulo="Fatores da nota das fontes" /> : <p className="nx-painel-clinica__texto">Sem nota: falta ligar fontes para calcular.</p>}
          </section>

          <section aria-label="Problemas abertos e quem resolve">
            <h4 className="nx-painel-clinica__titulo">{alertas.length ? `Problemas (${alertas.length}) e quem resolve` : "Problemas abertos"}</h4>
            {alertas.length === 0 ? (
              <p className="nx-painel-clinica__texto">Nenhum problema aberto.</p>
            ) : (
              <ul className="nx-painel-clinica__alertas">
                {alertas.map((a) => (
                  <li key={a.chave} className="nx-painel-clinica__alerta" title={a.titulo}>
                    <p>{a.texto}</p>
                    <div className="nx-painel-clinica__alerta-pe">
                      <AdmChip tom="marca" semIcone titulo={`Quem resolve: ${a.quem}`}>
                        Quem resolve: {a.quem}
                      </AdmChip>
                      {a.acesso && (
                        <Link to="/admin/$clientId" params={{ clientId: clinica.id }} hash="acesso" className="adm-link">
                          Abrir o acesso
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="nx-painel-clinica__links">
            <Link to="/$clientId" params={{ clientId: clinica.id }} search={{ preset: "30d" }} className="adm-btn adm-btn--pri">
              Abrir resultados <ArrowRight aria-hidden />
            </Link>
            <Link to="/admin/$clientId" params={{ clientId: clinica.id }} className="adm-btn" title="Fontes, acesso e configuração">
              Gerenciar
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
