# Runbook de Recovery de Dados — Vide Hub (beta controlado)

Status: **preparado, ainda não exercitado em produção.** PITR e delete
protection só passam a valer depois do stage `enable-and-drill` do workflow
`Recovery Minimal Gate — Controlado`, que exige autorização de produção
separada. Até lá, confira o estado real com o stage `preflight`.

## 1. Escopo

- Projeto: `vide-digital-saas`. Banco Firestore: `(default)` (confirmado pelo
  `describe` do workflow a cada execução — nunca assumido).
- Cobre: **dados do Firestore** (tenants, produtos, pedidos, leads, CRM,
  Landing Pages privadas/públicas, atendimento, IA, auditoria). As imagens de
  produto/LP ficam em base64 dentro dos documentos, então também são dados
  do Firestore.
- Não cobre: Firebase Auth (§14), Cloud Storage (§15), Secrets (§16).

## 2. Rollback de código ≠ recovery de dados

Reverter commit, republicar Pages, reimplantar Functions ou Rules
**não desfaz** escrita, exclusão ou corrupção de dados. Git não é backup.
Use `docs/ROLLBACK_GUIDE.md` para código e este runbook para dados.

## 3. Firestore PITR

- Desligado: retenção de **1 hora** — leitura de qualquer instante da última
  hora (sem export).
- Ligado: retenção de **7 dias**, **uma versão por minuto**; leitura, export
  e clone em timestamps de **minuto cheio** (dentro da última hora continua
  valendo qualquer instante).
- **A janela não é retroativa**: começa a acumular no momento em que o PITR é
  ligado e cresce até 7 dias. Sempre confira `earliestVersionTime` (§8).
- Custo: cobrado como armazenamento (GB-mês, sem cota gratuita, exige
  billing); leituras históricas e exports cobram leitura por documento.

## 4. Delete protection

Impede **apagar o banco** (`databases delete`) enquanto estiver ligada.
**Não** protege contra exclusão de documentos/coleções nem corrupção — isso
é papel do PITR.

## 5. Procedimento de incidente

```
DETECTAR → PARAR ESCRITAS DE RISCO → IDENTIFICAR ESCOPO → ESCOLHER T
PRÉ-INCIDENTE → LER HISTÓRICO → COMPARAR → APROVAÇÃO HUMANA →
WRITE-BACK SELETIVO → VALIDAR → AUDITAR → LIBERAR
```

1. Registre hora de detecção, sintoma, tenants e coleções suspeitas.
2. Pare a causa (§6) antes de qualquer recuperação.
3. Delimite escopo: quais documentos, de quais tenants, entre quais horários.
4. Escolha T (§7) e leia o histórico (§8) **sem escrever nada**.
5. Compare histórico × atual e gere a lista exata de documentos/campos a
   restaurar. Leve ao proprietário para **aprovação explícita**.
6. Só então faça o write-back seletivo (§9–§11), valide (§17) e registre (§21).

## 6. Congelar escritas

Em incidente grave: suspender a origem (ex.: não publicar/editar LPs, pausar
onboarding, reverter a Function/Rule defeituosa pelo canal de deploy
aprovado). O objetivo é parar novas escritas erradas **antes** de restaurar —
restaurar com a causa ativa é sobrescrito de novo.

## 7. Escolher T (pré-incidente)

- Use o último instante **comprovadamente bom** antes da primeira escrita
  ruim (logs de auditoria, `updateTime` dos documentos afetados).
- Precisa ser ≥ `earliestVersionTime` e, se mais antigo que 1 hora, um
  **minuto cheio** (ex.: `2026-10-01T14:32:00Z`).
- Em dúvida, leia dois ou três T candidatos e compare antes de escolher.

## 8. Leitura histórica (stale read)

Server SDK (Admin), transação somente leitura com `readTime`:

```js
const snap = await db.runTransaction((tx) => tx.get(ref), { readOnly: true, readTime: T });
```

Consultas também podem ser lidas no mesmo `readTime` (`tx.get(query)`).
Confira antes o estado real:

```bash
gcloud firestore databases describe --database='(default)' --project=vide-digital-saas \
  --format="yaml(pointInTimeRecoveryEnablement,versionRetentionPeriod,earliestVersionTime,deleteProtectionState)"
```

Observação: a tipagem do `@google-cloud/firestore` 7.x ainda descreve
`readTime` como limitado a 60 s — comentário anterior ao PITR; a janela
efetiva é a do PITR (§3). Valide no drill antes de depender de T antigos.

## 9. Recuperar UM documento

Ler o documento em T → comparar com o atual → após aprovação, gravar de volta
**somente** os campos afetados no mesmo path. Nunca `set()` cego de outro
documento.

## 10. Recuperar uma coleção / subconjunto

Mesmo padrão, com uma query lida em T (filtrada pelo escopo) e write-back
documento a documento, em lotes pequenos, com lista aprovada. Para volumes
grandes, prefira export PITR filtrado (§12) ou clone para investigar.

## 11. Recuperar um tenant

Não existe ferramenta pronta no produto (decisão consciente: nada de
restauração genérica automática). Os campos de dono variam por coleção —
`criadoPor`, `donoUID`, `emailDono`, `ownerUid`, `tenantId` — e documentos
com escopo por slug/ID derivado do dono. Antes do write-back, **cada**
documento precisa ter o dono conferido contra o UID do tenant afetado.

## 12. Clone / export PITR / backup

- **Clone**: `gcloud firestore databases clone --source-database=... --snapshot-time=... --destination-database=...`
  cria um **banco novo** (dados + índices; **sem** Rules e TTL) — útil para
  investigação ampla sem tocar produção. O app só usa `(default)`, então
  voltar dados de um clone ainda exige write-back seletivo.
- **Export PITR**: `gcloud firestore export gs://... --snapshot-time=... --collection-ids=...`
  (minuto cheio, dentro da janela).
- **Backup agendado**: **SHOULD DURING BETA — proposta não implementada**
  (diário, retenção 14 dias). Restore de backup sempre cria banco novo.

## 13. Segurança multi-tenant

Nunca restaurar o banco inteiro por cima de produção (reverteria todos os
tenants). Todo write-back tem allowlist explícita de paths e confere o dono.
Documentos públicos e privados precisam ficar coerentes: `landing_pages` ×
`landing_pages_publicas`, `landing_pages_blocos` × `landing_pages_blocos_publicas`,
tenant × `vitrines_publicas`. Testes destrutivos de isolamento só no Emulator.

## 14. Auth (separado)

PITR/backup do Firestore **não** recuperam usuários do Firebase Auth. O UID é
estrutural (`usuarios/{uid}`, `criadoPor`, `donoUID`, funcionários). Se um
usuário for apagado, recriá-lo com UID novo órfã o tenant: a recriação deve
usar o **mesmo UID** (Admin SDK, `createUser({ uid })` ou `importUsers`); sem
hash de senha, o usuário redefine a senha. Procedimento de Auth: **SHOULD
DURING BETA**.

## 15. Storage (separado)

Nenhum fluxo atual do app faz upload/download no bucket
`vide-digital-saas.firebasestorage.app` (imagens ficam em base64 no
Firestore). Tamanho, soft delete e versionamento reais são **conferidos pelo
preflight a cada execução**, não fixados aqui. Não alterar Storage por este
runbook.

## 16. Secrets (separado)

Secrets (GitHub Actions, Secret Manager do WhatsApp) são configuração:
rotacionáveis/recriáveis, não fazem parte do recovery de Firestore. Nunca
registrar valores em incidentes ou artefatos.

## 17. Validação pós-recovery

- Reler cada documento restaurado e comparar com o esperado aprovado.
- Conferir que documentos fora da lista não mudaram (contagem/`updateTime`).
- Conferir coerência pública × privada (§13).

## 18. Smoke

Login do dono afetado, dashboard, Produtos, Pedidos, Leads, abrir a loja
pública e a LP afetada. Nada de dados reais em logs/prints.

## 19. Cleanup

Remover somente artefatos temporários criados pelo procedimento (clone,
export, scripts locais). Nunca apagar coleção inteira nem usar wildcard.

## 20. Escalonamento

Qualquer incidente com dado de cliente: proprietário decide congelamento,
escopo e aprovação do write-back. Incidente cross-tenant: tratar como
segurança (isolar causa antes de restaurar).

## 21. Evidências do workflow

`Recovery Minimal Gate — Controlado` (`.github/workflows/recovery-minimal-gate.yml`):

- `preflight` (confirmação `READ_ONLY`): somente leitura — describe do banco,
  backup schedules/backups, metadados e tamanho do bucket, billing.
- `enable-and-drill` (confirmação `ENABLE_RECOVERY_049`): mesmo preflight,
  habilita **só** delete protection e PITR (idempotente, sem `--no-*`),
  confere o describe depois (zero drift fora da allowlist) e roda
  `scripts/recovery-drill-049.mjs`: fixture técnica
  `recovery_drills/RECOVERY-DRILL-049-<ms>` do tenant QA
  `vide-hub-qa-testes` → mutação → prova crítica (atual MUTATED e histórico
  em T0 ORIGINAL, T0 = readTime do servidor) → write-back só de
  `tenantId`/`marker`/`drillId` → validação → isolamento → cleanup só do
  documento criado.
- Gates antes de autenticar: branch main, SHA exato = HEAD de main, Quality
  Gate 4/4 do SHA, projeto/banco/slug/confirmação exatos.
- Artefato `recovery-gate-049` (JSON sem conteúdo, tenant ou credencial) e
  resumo no Step Summary.

## 22. Limitações atuais

- RPO/RTO **contratuais: NÃO DEFINIDOS.** RTO observado só existe depois do
  primeiro `enable-and-drill` bem-sucedido (valor no artefato) — mede um
  documento, não restauração ampla.
- Recuperação por tenant é procedimento manual assistido, sem ferramenta.
- Sem backup agendado, sem alerta de falha (missão de observabilidade).
- Janela PITR cresce a partir da ativação; incidentes antes dela só contam
  com a retenção de 1 hora.
