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

```bash
npm run laws:update   # baixa do Planalto e regenera public/data/*.json
```

Confira o resultado (o script imprime quantos artigos e títulos cada lei tem) antes de gerar um APK novo.
As leis ficam em `scripts/laws/laws.config.mjs`.

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
