export interface LawMeta {
  id: string;
  tab: string;
  name: string;
  short: string;
}

export interface Heading {
  h: number;
  l: string;
  n: string;
  id: string;
  a?: string[];
}
export interface Para {
  t: string;
  n?: string[];
  r?: 1;
}
export interface Article {
  k: string;
  p: Para[];
  rb?: string;
  r?: 1;
}
export type LawItem = Heading | Article;

export interface LawData {
  id: string;
  title: string;
  url: string;
  fetched: string;
  items: LawItem[];
}

export const isHeading = (it: LawItem): it is Heading => "h" in it;

export const LAWS: LawMeta[] = [
  { id: "cf", tab: "CF/88", name: "Constituição Federal", short: "CF/88" },
  { id: "cc", tab: "CC", name: "Código Civil", short: "CC" },
  { id: "cpc", tab: "CPC", name: "Código de Processo Civil", short: "CPC" },
  { id: "cp", tab: "CP", name: "Código Penal", short: "CP" },
  { id: "cpp", tab: "CPP", name: "Código de Processo Penal", short: "CPP" },
  { id: "l8112", tab: "Adm", name: "Servidores públicos federais", short: "Lei 8.112/90" },
  { id: "l8429", tab: "Adm", name: "Improbidade administrativa", short: "Lei 8.429/92" },
  { id: "l9784", tab: "Adm", name: "Processo administrativo", short: "Lei 9.784/99" },
  { id: "l14133", tab: "Adm", name: "Licitações e contratos", short: "Lei 14.133/21" },
  { id: "l8987", tab: "Adm", name: "Concessões e permissões", short: "Lei 8.987/95" },
  { id: "l11079", tab: "Adm", name: "Parcerias público-privadas", short: "Lei 11.079/04" },
  { id: "l12846", tab: "Adm", name: "Lei Anticorrupção", short: "Lei 12.846/13" },
  { id: "l12527", tab: "Adm", name: "Acesso à informação", short: "Lei 12.527/11" },
  { id: "l13303", tab: "Adm", name: "Lei das Estatais", short: "Lei 13.303/16" },
];
export const TABS = ["CF/88", "CC", "CPC", "CP", "CPP", "Adm"];
export const lawMeta = (id: string): LawMeta => LAWS.find((l) => l.id === id) ?? LAWS[0];
