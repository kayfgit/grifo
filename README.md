# Grifo

Lei seca para estudar no celular: CF/88, CC, CPC, CP, CPP e as principais leis de direito administrativo,
cada uma em uma aba, com sumário, busca, pincel para grifar e anotações por artigo. Funciona offline.

App Android feito com Vite + TypeScript e [Capacitor 8](https://capacitorjs.com). Os textos vêm do
planalto.gov.br e são convertidos em JSON por `scripts/laws/`.

## Requisitos

- Node 22
- JDK 21 (Capacitor 8) e Android SDK 36 (`platforms;android-36`, `build-tools;36.0.0`)
- `adb` para instalar no celular

## Desenvolvimento

```bash
npm install
npm run dev          # abre no navegador em http://localhost:5173
npm test             # testes (Vitest)
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run format       # Prettier
```

## Gerar o instalador (APK)

1. Copie `.env.example` para `.env` e preencha a chave de assinatura e `JAVA21_HOME`.
2. Suba a versão em `package.json` e escreva o que mudou em `CHANGELOG.md`.
3. Rode:

```bash
npm run android:apk      # gera release/Grifo-<versão>.apk assinado
npm run android:install  # instala em todo celular que o adb enxerga
```

O `versionCode` vem da versão (`0.2.1` → `201`), então cada versão nova instala por cima da anterior
sem apagar os grifos.

**A chave de assinatura (`.signing/grifo-release.jks`) e as senhas do `.env` não vão para o git.
Guarde uma cópia em lugar seguro.** Sem elas, uma atualização não instala por cima do app já
instalado: seria preciso desinstalar, e os grifos se perdem (a menos que haja backup).

## Atualizar os textos das leis

O app traz uma cópia das leis e, uma vez por dia, compara com o catálogo publicado em
[kayfgit/grifo-leis](https://github.com/kayfgit/grifo-leis) (repositório público, só com os textos). As
leis que mudaram são baixadas e usadas no lugar da cópia do app; leis novas aparecem no catálogo.

Para publicar as leis atualizadas:

```bash
npm run laws:publish   # baixa do Planalto, converte, confere e publica no grifo-leis
```

Rode de um computador no Brasil: o Planalto recusa acessos vindos de servidores na nuvem (como o GitHub
Actions). Uma lei só é publicada se passar nas verificações (`scripts/laws/quality.mjs`): número de
artigos, último artigo esperado (`last` em `scripts/laws/laws.config.mjs`), artigos repetidos e comparação
com a versão já publicada. Se falhar, a versão anterior continua no app e o relatório
(`.cache/laws-report.md`) diz o motivo.

No Windows, a tarefa agendada **"Grifo - publicar leis"** roda isso toda segunda às 9h
(`scripts/laws/publish-weekly.ps1`). Se o computador estiver desligado, ela roda assim que der; se falhar,
tenta de novo até 3 vezes, de hora em hora. O resultado vai para `.cache/laws-publish.log`, e se alguma lei
não passar nas verificações abre uma issue em grifo-leis. Para criar a tarefa em outro computador:

```powershell
$a = New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -WorkingDirectory "D:\projects\grifo" `
  -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "D:\projects\grifo\scripts\laws\publish-weekly.ps1"'
$t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Grifo - publicar leis" -Action $a -Trigger $t -Settings $s
```

Para atualizar também a cópia que vai dentro do app (antes de gerar um APK):

```bash
npm run laws:update   # regenera public/data/*.json
```

Os grifos guardam as palavras grifadas, então continuam no lugar certo quando uma lei muda.

## Releases no GitHub

Ao enviar uma tag `v<versão>`, o workflow `release.yml` gera o APK assinado e publica uma release com a
seção correspondente do `CHANGELOG.md`. Ele precisa destes secrets no repositório:
`GRIFO_KEYSTORE_BASE64` (o `.jks` em base64), `GRIFO_KEYSTORE_PASSWORD`, `GRIFO_KEY_ALIAS`, `GRIFO_KEY_PASSWORD`.

## Estrutura

- `src/main.ts`: interface (abas, leitor, pincel, anotações, painel, ajustes)
- `src/marks.ts`: modelo dos grifos (pintar, apagar, encaixar na palavra, salvar)
- `src/storage.ts`: grifos e anotações por lei, backup
- `src/platform.ts`: integração com o Android (Preferences, botão voltar, compartilhar)
- `scripts/laws/`: download e conversão dos textos do Planalto
- `android/`: projeto Android gerado pelo Capacitor
