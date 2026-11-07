import { test } from "vitest";
import assert from "node:assert/strict";
import { extractLines, splitNotes, articleKey, buildLaw, normalize } from "../scripts/laws/parse.mjs";

const page = (body) => `<html><head><title>x</title></head><body>
<p>Presidência da República</p><p>LEI Nº 1, DE 2000</p>${body}
<p>Brasília, 1 de janeiro de 2000; 179º da Independência.</p><p>FULANO</p></body></html>`;

test("drops struck-through text and keeps the current version", () => {
  const lines = extractLines(
    page(`<p><strike>Art. 1º Texto antigo.</strike></p>
          <p><span style="text-decoration: line-through">I - velho;</span></p>
          <p>Art. 1º Texto novo. (Redação dada pela Lei nº 2, de 2001)</p>`),
  );
  assert.ok(!lines.some((l) => l.includes("antigo") || l.includes("velho")));
  assert.ok(lines.includes("Art. 1º Texto novo. (Redação dada pela Lei nº 2, de 2001)"));
});

test("turns superscript o into the ordinal sign", () => {
  const lines = extractLines(page(`<p>Art. 1<sup><u>o</u></sup> Esta Lei.</p>`));
  assert.ok(lines.includes("Art. 1º Esta Lei."));
  assert.equal(normalize("§ 2o Para os fins"), "§ 2º Para os fins");
});

test("splits trailing amendment notes but keeps VETADO in the text", () => {
  assert.deepEqual(splitNotes("I - algo; (Incluído pela Lei nº 3, de 2002) (Vide ADI 123)"), {
    text: "I - algo;",
    notes: ["Incluído pela Lei nº 3, de 2002", "Vide ADI 123"],
  });
  assert.deepEqual(splitNotes("Art. 3º (VETADO)"), { text: "Art. 3º (VETADO)", notes: [] });
});

test("builds article keys, including letters and ADCT prefix", () => {
  assert.equal(articleKey("Art. 1.228. O proprietário"), "art-1228");
  assert.equal(articleKey("Art. 121-A. Matar"), "art-121-A");
  assert.equal(articleKey("Art. 5º Todos", "adct-"), "adct-art-5");
  assert.equal(articleKey("Art. 1º - Não há crime"), "art-1");
  assert.equal(articleKey("Art. 359-M-A. Quando"), "art-359-M-A");
  assert.equal(articleKey("Art. 1º-A. Texto"), "art-1-A");
});

test("structures headings, articles, rubrics and paragraphs", () => {
  const lines = extractLines(
    page(`<p>O PRESIDENTE DA REPÚBLICA Faço saber que o Congresso decreta:</p>
      <p>PARTE ESPECIAL</p><p>TÍTULO I<br>DOS CRIMES CONTRA A PESSOA</p>
      <p>CAPÍTULO I - DOS CRIMES CONTRA A VIDA</p>
      <p>Homicídio simples</p><p>Art. 121. Matar alguém:</p><p>Pena - reclusão, de seis a vinte anos.</p>
      <p>Caso de diminuição de pena</p><p>§ 1º Se o agente comete o crime</p>
      <p>(Vide Lei nº 9.999)</p>`),
  );
  const items = buildLaw(lines);
  const headings = items.filter((i) => "h" in i);
  assert.deepEqual(
    headings.map((h) => [h.h, h.l, h.n]),
    [
      [0, "PARTE ESPECIAL", ""],
      [2, "TÍTULO I", "DOS CRIMES CONTRA A PESSOA"],
      [4, "CAPÍTULO I", "DOS CRIMES CONTRA A VIDA"],
    ],
  );
  const art = items.find((i) => i.k === "art-121");
  assert.equal(art.rb, "Homicídio simples");
  assert.deepEqual(
    art.p.map((p) => p.t),
    [
      "Art. 121. Matar alguém:",
      "Pena - reclusão, de seis a vinte anos.",
      "Caso de diminuição de pena",
      "§ 1º Se o agente comete o crime",
    ],
  );
  assert.equal(art.p[2].r, 1);
  assert.deepEqual(art.p[3].n, ["Vide Lei nº 9.999"]);
  assert.ok(items[0].k === "intro", "enacting clause kept as intro");
  assert.ok(!JSON.stringify(items).includes("FULANO"), "stops at the signature");
});

test("marks an article with only its label left as revoked", () => {
  const items = buildLaw(["Art. 1º Vale.", "Art. 2º (Revogado pela Lei nº 5, de 2005)"]);
  assert.equal(items.find((i) => i.k === "art-2").r, 1);
  assert.equal(items.find((i) => i.k === "art-1").r, undefined);
});

test("cleans letter-spaced headings and struck-out leftovers", () => {
  assert.equal(normalize("P A R T E G E R A L"), "PARTE GERAL");
  const items = buildLaw([
    "TÍTULO III",
    "DAS COISAS",
    "SUBTÍTULO I",
    "Do Condomínio",
    "Art. 1º Texto:",
    "I",
    "I - inciso;",
    "X (VETADO).",
  ]);
  assert.deepEqual(
    items.filter((i) => "h" in i).map((h) => [h.h, h.l]),
    [
      [2, "TÍTULO III"],
      [3, "SUBTÍTULO I"],
    ],
  );
  assert.deepEqual(
    items.find((i) => i.k === "art-1").p.map((p) => p.t),
    ["Art. 1º Texto:", "I - inciso;", "X (VETADO)."],
  );
});

test("maps cp1252 control characters and joins wrapped heading names", () => {
  assert.equal(normalize("VIII \u0096 observância"), "VIII – observância");
  const items = buildLaw([
    "CAPÍTULO V",
    "DO LENOCÍNIO E DO TRÁFICO DE PESSOA PARA FIM DE",
    "EXPLORAÇÃO SEXUAL",
    "Art. 227. Induzir alguém:",
  ]);
  assert.equal(items[0].n, "DO LENOCÍNIO E DO TRÁFICO DE PESSOA PARA FIM DE EXPLORAÇÃO SEXUAL");
});

test("takes 'Disposições Gerais' as a section name, not a rubric", () => {
  const items = buildLaw(["Seção I", "Disposições Gerais", "Art. 1º Texto."]);
  assert.equal(items[0].n, "Disposições Gerais");
  assert.equal(items[1].rb, undefined);
});

test("removes zero-width spaces", () => {
  assert.equal(normalize("Art. 1º" + String.fromCharCode(0x200b) + " Texto"), "Art. 1º Texto");
});
