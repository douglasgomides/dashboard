// SAP · Anexos por clínica (sap_anexos): texto dos documentos que os prompts do gerador pedem. A leitura do arquivo
// acontece no navegador (txt, md, csv, json e docx); PDF não é lido: exporte como Docx ou cole o texto.
import { unzipSync, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

export interface AnexoSalvo {
  slot: string;
  nome: string;
  atualizado_em: string;
  bytes: number;
}

export const LIMITE_ANEXO = 60_000; // caracteres por anexo: é o que o servidor aceita por entrada

export async function listarAnexos(clinicaId: string): Promise<AnexoSalvo[]> {
  const { data, error } = await db.from("sap_anexos").select("slot, nome, atualizado_em, texto").eq("clinica_id", clinicaId);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return ((data ?? []) as { slot: string; nome: string; atualizado_em: string; texto: string }[]).map((r) => ({ slot: r.slot, nome: r.nome, atualizado_em: r.atualizado_em, bytes: r.texto.length }));
}

export async function salvarAnexo(clinicaId: string, slot: string, nome: string, texto: string) {
  const { error } = await db.rpc("sap_salvar_anexo", { p_clinica_id: clinicaId, p_slot: slot, p_nome: nome, p_texto: texto });
  if (error) throw error;
}

export async function apagarAnexo(clinicaId: string, slot: string) {
  const { error } = await db.rpc("sap_apagar_anexo", { p_clinica_id: clinicaId, p_slot: slot });
  if (error) throw error;
}

/** Texto de um .docx: junta os parágrafos de word/document.xml. */
export function textoDeDocx(bytes: Uint8Array): string {
  const arquivos = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = arquivos["word/document.xml"];
  if (!xml) throw new Error("Não achei o texto dentro do .docx");
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function lerArquivoAnexo(arquivo: File): Promise<string> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".pdf")) throw new Error("PDF não é lido aqui. Exporte o documento como Docx ou como texto, ou cole o conteúdo.");
  if (arquivo.size > 5_000_000) throw new Error("Arquivo grande demais (limite de 5 MB).");
  if (nome.endsWith(".docx")) return textoDeDocx(new Uint8Array(await arquivo.arrayBuffer()));
  if (/\.(txt|md|csv|json|tsv)$/.test(nome) || arquivo.type.startsWith("text/")) return (await arquivo.text()).trim();
  throw new Error("Formato não aceito. Use .docx, .txt, .md ou .csv, ou cole o texto.");
}
