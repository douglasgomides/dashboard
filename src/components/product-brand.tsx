import { ehEnderecoSap } from "@/lib/marca";

export function ProductBrand({ product = ehEnderecoSap() ? "sap" : "nexo", dark = false }: { product?: "nexo" | "sap"; dark?: boolean }) {
  const name = product === "sap" ? "SAP" : "Nexo";
  return (
    <div className={`product-brand${dark ? " product-brand--dark" : ""}`} aria-label={`${name}, da Doctor Creator`}>
      <span className="product-brand__symbol" aria-hidden="true">{product === "sap" ? "S" : "N"}</span>
      <span className="product-brand__copy so-aberta"><strong>{name}</strong><span>Doctor Creator</span></span>
    </div>
  );
}
