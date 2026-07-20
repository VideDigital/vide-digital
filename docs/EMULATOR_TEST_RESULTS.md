# Emulator Test Results — Vide Hub

Data: 2026-07-19/2026-07-20  
Branch: `feat/firebase-production-hardening-v1`  
Project ID local: `demo-vide-hub`

## Ambiente executado

- Node usado nos comandos: `v24.14.0`
- pnpm: `11.9.0`
- Firebase CLI: `13.35.1`
- Java inicial do sistema: `1.8.0_481` — incompatível com Firebase CLI.
- Java usado nos testes: Temurin JRE `17.0.19` portátil em `%TEMP%`.
- Sistema: Windows / PowerShell.

## Instalação

Comando:

```bash
pnpm install
```

Resultado:

- dependências instaladas;
- `pnpm-lock.yaml` gerado;
- workspace `functions/` instalado;
- builds aprovados explicitamente para `@firebase/util` e `protobufjs`.

Warnings:

- `functions` pede Node 20, mas host local era Node 24;
- subdependências depreciadas vindas do ecossistema Firebase;
- Firebase CLI sem login em projeto demo.

## Correções feitas durante validação

- Scripts trocados para `pnpm` e execução sequencial dos testes de rules.
- Adicionado `pnpm-workspace.yaml`.
- Adicionado `.gitignore` para `node_modules` e logs locais.
- Adicionado seed seguro do Emulator.
- Frontend passou a conectar Auth/Firestore/Storage/Functions aos Emulators somente com flag explícita em localhost.
- App Check continua ativo fora do Emulator, mas é desativado quando `FUNCTIONS_EMULATOR=true`.
- Firestore Rules passaram a checar existência de claim antes de ler `videAdmin`.
- Helpers `criadoPorUnchanged` e `donoUIDUnchanged` passaram a usar `diff` para campos opcionais.
- Storage Rules passaram a checar shape do documento de funcionário e `hasAny` em lista de permissões.
- Smoke frontend passou a encerrar explicitamente conexões do SDK para não manter Node pendurado.

## Comandos executados com sucesso

```bash
pnpm run check
pnpm run test:rules
pnpm run test:functions
pnpm run test:frontend:emulator
pnpm run test:all
```

## Resultados

- Firestore Rules: 9 testes, 9 aprovados, 0 falhos.
- Storage Rules: 5 testes, 5 aprovados, 0 falhos.
- Functions unitárias: 3 testes, 3 aprovados, 0 falhos.
- Frontend Emulator smoke: aprovado.

Total automatizado contado: 18 testes formais + 1 smoke frontend.

## Functions carregadas no Emulator

- `createEmployee`
- `updateEmployee`
- `disableEmployee`
- `enableEmployee`
- `resetEmployeePassword`
- `syncAdminClaims`
- `createAdminMember`
- `adminUpdateStoreStatus`
- `adminUpdatePlan`
- `createPublicLead`
- `incrementPublicMetric`
- `createPublicChat`
- `sendPublicChatMessage`
- `auditWrite`
- `markNotificationRead`

## Smoke frontend validado

O smoke conectou ao Auth Emulator, Firestore Emulator e Functions Emulator, fez login local e chamou:

- `createPublicLead`
- `incrementPublicMetric`
- `createPublicChat`
- `sendPublicChatMessage`

## Testes não executados automaticamente

- Navegação visual completa no navegador real.
- Google Login popup real.
- Fluxos manuais completos de Dashboard/Admin/Studio.
- App Check real em staging/produção.

## Confirmações

- Nenhum `firebase deploy` foi executado.
- Nenhum projeto Firebase real foi usado.
- Nenhuma credencial real foi adicionada.
- Nenhum merge foi feito.
