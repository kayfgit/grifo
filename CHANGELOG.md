# Changelog

Todas as mudanças do Grifo, por versão. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Unreleased]

### Ferramentas

- Publicação semanal das leis por tarefa agendada no Windows (`scripts/laws/publish-weekly.ps1`), com
  novas tentativas em caso de falha, log em `.cache/laws-publish.log` e issue em grifo-leis quando alguma
  lei não passa nas verificações.

## [0.3.0] - 2026-11-06

### Adicionado

- Atualização das leis sem precisar de um app novo: uma vez por dia o Grifo confere se alguma lei mudou e
  baixa só as que mudaram. Também dá para conferir na hora em Leitura › Leis › Verificar atualizações.
  Leis novas que entrarem no catálogo aparecem do mesmo jeito.
- Os grifos acompanham o texto: quando uma lei muda (um inciso novo, uma redação nova), cada grifo é
  procurado pelas palavras grifadas e continua no lugar certo. Grifos cujas palavras saíram da lei somem.

## [0.2.0] - 2026-11-06

### Adicionado

- Estudos (botão "Estudar" no topo):
  - Revisão com cartões: cada parágrafo grifado vira um cartão com o grifo escondido. Você lembra, toca em
    "Mostrar resposta" e avalia (Errei, Difícil, Bom, Fácil); a repetição espaçada decide quando o cartão volta.
    Escolha de quais cores viram cartões e de quantos cartões novos por dia. O número no botão mostra quantos
    cartões vencem hoje.
  - Cronograma: escolha as leis, a data da prova e os dias de estudo. O Grifo divide a leitura em sessões do
    mesmo tamanho (pelo tamanho do texto), reserva os últimos dias para revisão, mostra a leitura de hoje com
    atalho para abrir cada trecho e redistribui o que sobrar se você faltar um dia.
- 69 leis novas, 83 no total. Direito administrativo completo (organização da Administração, desapropriação,
  consórcios, terceiro setor, agências reguladoras, servidores, LRF, LGPD, Estatuto da Cidade, crimes de
  responsabilidade e mais) e novas abas: Const. (ADI/ADC, ADPF, MS, MI, HD, ação popular, ACP, súmula vinculante),
  Civil (LINDB, CDC, locações, registros públicos, falências), Proc. (juizados, processo eletrônico, execução
  fiscal, arbitragem, mediação, LOMAN), Penal (legislação especial), Estatutos (ECA, Pessoa Idosa, PcD),
  Trabalho (CLT), Eleitoral (Código Eleitoral, Lei das Eleições, partidos, inelegibilidade) e Tributário (CTN).
- Escolher lei com busca: toque no nome da lei no topo ou em "Todas" na fileira de leis da aba.

### Corrigido

- Textos que uma lei insere em outra (por exemplo, os crimes que a Lei 14.133 colocou no Código Penal) não
  aparecem mais como artigos soltos da lei que altera.
- Páginas do Planalto em UTF-16, artigos como "Art. 10A", assinaturas com "Brasília ," e trechos com
  "Vigência encerrada" agora são lidos corretamente.

## [0.1.0] - 2026-11-06

Primeira versão para Android.

### Adicionado

- Lei seca da CF/88, Código Civil, CPC, Código Penal, CPP e das principais leis de direito administrativo
  (8.112/90, 8.429/92, 9.784/99, 14.133/21, 8.987/95, 11.079/04, 12.846/13, 12.527/11, 13.303/16), cada uma na sua aba.
- Textos compilados do Planalto com os trechos revogados já retirados; notas de redação escondidas, com opção para mostrar.
- Sumário por Parte, Livro, Título, Capítulo, Seção e Subseção, com indicação de onde você está no texto.
- "Ir para o artigo" (5, 1.228, 121-A, "adct 10") e busca no texto que ignora acentos.
- Pincel com cinco cores e borracha; o grifo encaixa na palavra inteira. Com o pincel ativo, role com dois dedos.
- Grifar selecionando o texto (toque longo) e escolhendo a cor.
- Anotações por artigo e lista de todas as marcações da lei, com filtro por cor.
- Ajustes de leitura: tamanho do texto, tema claro/escuro/sistema, notas de redação e artigos revogados.
- Backup: exportar grifos e anotações para um arquivo (Drive, WhatsApp, e-mail) e importar de volta.
- Funciona sem internet; tudo fica salvo no aparelho.
