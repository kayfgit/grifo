import { describe, expect, test } from "vitest";
import { artLabel, articleKeyFromInput, esc, fold, kindOf, LABEL_RE, nice } from "../src/text";

describe("text helpers", () => {
  test("escapes HTML", () => expect(esc('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;"));
  test("folds accents for search", () => expect(fold("Ação PÚBLICA")).toBe("acao publica"));
  test("title-cases uppercase headings only", () => {
    expect(nice("DOS DIREITOS E DEVERES")).toBe("Dos Direitos e Deveres");
    expect(nice("Da Personalidade")).toBe("Da Personalidade");
  });
  test("labels articles", () => {
    expect(artLabel("art-5")).toBe("Art. 5º");
    expect(artLabel("art-1228")).toBe("Art. 1.228");
    expect(artLabel("art-121-A")).toBe("Art. 121-A");
    expect(artLabel("adct-art-10")).toBe("ADCT Art. 10");
    expect(artLabel("preambulo")).toBe("Preâmbulo");
  });
  test("reads the go-to-article box", () => {
    expect(articleKeyFromInput("5")).toBe("art-5");
    expect(articleKeyFromInput("1.228")).toBe("art-1228");
    expect(articleKeyFromInput("121-a")).toBe("art-121-A");
    expect(articleKeyFromInput("Art. 5º")).toBe("art-5");
    expect(articleKeyFromInput("adct 10")).toBe("adct-art-10");
    expect(articleKeyFromInput("cinco")).toBeNull();
  });
  test("classifies provisions and finds their labels", () => {
    expect(kindOf("Art. 5º Todos", 0, "art-5")).toBe("cap");
    expect(kindOf("§ 1º As normas", 1, "art-5")).toBe("par");
    expect(kindOf("Parágrafo único. Todo", 1, "art-6")).toBe("par");
    expect(kindOf("LXXVIII - a todos", 2, "art-5")).toBe("inc");
    expect(kindOf("a) os analfabetos", 3, "art-14")).toBe("ali");
    expect(kindOf("Nós, representantes", 0, "preambulo")).toBe("");
    expect("Art. 1.228. O proprietário".match(LABEL_RE)?.[0]).toBe("Art. 1.228.");
    expect("§ 2º Se".match(LABEL_RE)?.[0]).toBe("§ 2º");
  });
});
