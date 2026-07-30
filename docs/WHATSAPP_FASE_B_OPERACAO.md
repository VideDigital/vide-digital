# WhatsApp Oficial V1 — Fase B: Runbook de Operação

Guia passo a passo para levar o WhatsApp Oficial V1 de "código pronto" (Fase
A, já em `main`) para uma conexão real, segura e testada em produção. Escrito
para ser seguido por alguém com pouco conhecimento técnico — cada etapa é
pequena e diz exatamente o que fazer, sem pular passos.

**Antes de começar**: leia `docs/WHATSAPP_OFICIAL.md` (arquitetura completa)
e rode o preflight (`node scripts/whatsapp-production-preflight.mjs`) —
ele confere sozinho boa parte do que este documento pede manualmente.

**Regra de ouro deste runbook**: nenhum valor de token, secret ou senha
deve, em nenhuma etapa, ser colado num chat, salvo num arquivo, aparecer
num commit ou ser mostrado numa captura de tela. Sempre que um comando
pedir um valor secreto, ele vai pedir via prompt oculto do terminal — nunca
como argumento visível, nunca como variável de ambiente exportada num
arquivo versionado.

**Não marque nada como CONCLUÍDO até completar a Parte G (Teste Real)
inteira.**

---

## PARTE A — Meta (App, WABA, número)

1. Acesse [developers.facebook.com](https://developers.facebook.com/) e
   crie (ou selecione) um **Meta App** do tipo **Business**.
2. No painel do App, adicione o produto **WhatsApp**.
3. Confirme que o App está vinculado a um **Business Portfolio** (antigo
   "Business Manager"). Se ainda não tiver um, crie um durante este passo —
   a Meta guia isso na própria tela.
4. **Verificação da empresa**: pode ou não ser exigida dependendo do que
   você já usa na Meta hoje. Regra geral e atual da Meta (confirme no
   próprio painel, pois isso muda com frequência): para **testar** o
   WhatsApp com números de teste fornecidos pela própria Meta, verificação
   de empresa geralmente **não** é exigida. Para usar um **número de
   telefone real** (o seu, de produção) e enviar mensagens para clientes de
   verdade, a Meta normalmente exige o Business Portfolio verificado. Não
   pule este passo assumindo que "vai dar certo depois" — confirme o status
   de verificação antes de seguir para o número real.
5. Dentro do produto WhatsApp do App, crie ou associe uma **WhatsApp
   Business Account (WABA)**.
6. Registre o **número de telefone** que vai atender pela loja (não pode
   ser um número já usado no WhatsApp comum/Business App comum — a Meta
   exige que ele não tenha uma conta WhatsApp ativa fora da Cloud API).
7. Anote (num lugar seguro, não neste chat) os seguintes IDs — todos são
   apenas identificadores, não são segredos, mas ainda assim evite deixá-los
   em texto solto por aí:
   - **Meta App ID**
   - **Business Portfolio ID**
   - **WABA ID**
   - **Phone Number ID** (diferente do número de telefone em si — é um ID
     interno da Meta)
   - **Display phone number** (o número formatado, ex. `+55 11 90000-0000`)
8. Configure um **System User** dentro do Business Portfolio (Configurações
   do Negócio → Usuários → Usuários do Sistema). Use um papel de **Admin**
   do sistema, escopo restrito ao necessário.
9. Atribua o **App** e a **WABA** a esse System User (Configurações do
   Negócio → mais opções → atribuir ativos).
10. Gere um **token de acesso** para o System User com os escopos
    `whatsapp_business_messaging` e `whatsapp_business_management`. Escolha
    a duração mais longa disponível (token de sistema, não expira como um
    token de usuário comum) — isso evita reautenticação frequente do
    piloto.
11. **Nunca cole esse token neste chat, num arquivo do repositório, num
    commit ou em qualquer lugar fora do prompt oculto do terminal quando o
    script pedir.**
12. No WhatsApp Manager (dentro do App), crie um **template simples de
    teste** (ex. categoria "Utility", corpo de texto simples, sem
    variáveis) — vai servir pro teste da Parte G.
13. Aguarde o status do template virar **APPROVED** (normalmente minutos,
    às vezes até 24h na primeira vez).
14. **Antes do deploy (Parte D)**, confirme a versão vigente da Graph API
    diretamente em
    [developers.facebook.com/docs/graph-api/changelog](https://developers.facebook.com/docs/graph-api/changelog).
    **Gate Manual obrigatório** — este runbook não avança sozinho aqui: o
    código atual usa `v25.0` (`functions/src/whatsapp/constants.js`),
    atualizada em 2026-07-29 a partir de confirmação **direta** do usuário
    na fonte oficial (não busca indireta). Ainda assim, a versão da Meta
    pode ter mudado de novo desde então — **confirme pessoalmente no link
    acima antes de prosseguir**, sempre, a cada deploy real. Se a versão
    vigente for diferente, atualize **só** a constante
    `WHATSAPP_GRAPH_VERSION` em `functions/src/whatsapp/constants.js`,
    rode os testes de novo (`pnpm run test:functions`) e faça um commit
    separado antes do deploy.

**Diferença Piloto/Teste vs. Produção real** (não afirmar que funciona
igual para todo tipo de conta — confirme sempre no painel atual da Meta):
para o **piloto assistido** desta V1 (um número, testado manualmente por
você), o caminho acima costuma bastar sem precisar de **App Review**
completo. Para **atender clientes de verdade em escala** (múltiplos
usuários automatizados, volume alto), a Meta pode exigir passar por **App
Review** com **Advanced Access** para os dois escopos listados no passo 10
— processo que envolve gravação de tela, descrição de uso e aprovação
manual da Meta, e que pode levar dias. Não assuma que o piloto libera
automaticamente o Advanced Access.

---

## PARTE B — Firebase/GCP (comandos para o Google Cloud Shell)

Abra o [Google Cloud Shell](https://console.cloud.google.com/) já dentro
do projeto `vide-digital-saas` (ou rode os comandos com um `gcloud` local
autenticado — o efeito é o mesmo).

Todos os comandos abaixo:
- fixam o projeto explicitamente (nunca dependem de um `gcloud config`
  prévio que pode estar apontando pro projeto errado);
- nunca ecoam nenhum valor de segredo;
- pedem o valor secreto via `--data-file=-` (lido do terminal, nunca
  gravado em disco nem passado como argumento visível).

### B.1 — Confirmar a conta ativa e o projeto

```bash
set -euo pipefail
gcloud config set project vide-digital-saas
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

Confirme que a conta impressa é a que você espera antes de continuar.

### B.2 — Conceder o papel mínimo pra você mesmo administrar secrets (se ainda não tiver)

Se sua conta já é Owner/Editor do projeto, pule este passo — mas isso
**não** deve ser usado como justificativa pra dar Owner/Editor pra
service account de **runtime** das Functions (isso é tratado no passo
B.5, e ali é proibido).

### B.3 — Criar os dois secrets globais

```bash
set -euo pipefail
gcloud config set project vide-digital-saas

# WHATSAPP_APP_SECRET — o "App Secret" do Meta App (painel → Configurações → Básico).
printf "Cole o App Secret e pressione Enter (nada será exibido): "
stty -echo
read -r WHATSAPP_APP_SECRET_VALUE
stty echo
printf "\n"
printf '%s' "$WHATSAPP_APP_SECRET_VALUE" | gcloud secrets create WHATSAPP_APP_SECRET \
  --data-file=- --replication-policy=automatic || \
  printf '%s' "$WHATSAPP_APP_SECRET_VALUE" | gcloud secrets versions add WHATSAPP_APP_SECRET --data-file=-
unset WHATSAPP_APP_SECRET_VALUE

# WHATSAPP_WEBHOOK_VERIFY_TOKEN — você inventa esse valor agora (uma string
# aleatória longa, ex. gerada com `openssl rand -hex 32`) — é o token que
# você vai digitar de novo no painel da Meta na Parte E, nunca a Meta que
# fornece.
printf "Cole (ou gere agora) o Verify Token do webhook e pressione Enter: "
stty -echo
read -r WHATSAPP_VERIFY_TOKEN_VALUE
stty echo
printf "\n"
printf '%s' "$WHATSAPP_VERIFY_TOKEN_VALUE" | gcloud secrets create WHATSAPP_WEBHOOK_VERIFY_TOKEN \
  --data-file=- --replication-policy=automatic || \
  printf '%s' "$WHATSAPP_VERIFY_TOKEN_VALUE" | gcloud secrets versions add WHATSAPP_WEBHOOK_VERIFY_TOKEN --data-file=-
unset WHATSAPP_VERIFY_TOKEN_VALUE
```

**Não crie um secret `META_APP_ID`.** Nenhuma Function usa esse valor
hoje — o código nunca declara `defineSecret("META_APP_ID")`
propositalmente, porque o Firebase CLI trata qualquer `defineSecret()`
carregado durante a análise do código como obrigatório e trava um deploy
`--non-interactive` pedindo pra criá-lo mesmo sem nenhuma Function usá-lo.

### B.4 — Token por tenant (piloto)

**Não crie aqui.** O token de acesso do piloto (System User, Parte A.10)
é gravado só pelo script `scripts/provision-whatsapp-pilot.mjs` na Parte
F — nunca manualmente, porque o script primeiro **testa a conexão real**
com a Meta antes de gravar qualquer coisa.

### B.5 — IAM mínimo pra service account de runtime

```bash
set -euo pipefail
gcloud config set project vide-digital-saas
PROJECT_NUMBER=$(gcloud projects describe vide-digital-saas --format="value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET_NAME in WHATSAPP_APP_SECRET WHATSAPP_WEBHOOK_VERIFY_TOKEN; do
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

**Nunca** conceda `roles/owner`, `roles/editor` ou
`roles/secretmanager.admin` pra essa service account — só
`secretAccessor`, e só nos secrets que ela de fato precisa ler. Os tokens
por tenant (criados na Parte F) recebem essa mesma concessão automaticamente
dentro do script de provisionamento (ele já grava o secret sob o projeto
certo; a concessão de IAM pra service account de runtime nesses secrets
por tenant específicos também precisa ser feita uma vez por tenant — o
preflight (`whatsapp:preflight` com `WHATSAPP_PREFLIGHT_PROJECT` definido)
avisa se a service account não tiver o papel certo).

---

## PARTE C — Deploy Firebase Spark (Rules/Storage/índices)

O WhatsApp adicionou Rules novas desde os últimos deploys de Rules
(coleções `whatsapp_*`, `canal: "whatsapp"` nos chats). Publique isso
**antes** das Functions.

1. No GitHub: **Actions** → **Deploy Firebase Spark** → **Run workflow**.
2. Branch: `main`.
3. `project_id`: `vide-digital-saas`.
4. `confirm_production`: `DEPLOY`.
5. Aguarde o workflow terminar verde.

Isso publica **Firestore Rules**, **Storage Rules** e **índices** — nunca
Functions.

---

## PARTE D — Deploy Firebase Functions — WhatsApp Oficial

**Só depois** dos secrets globais (Parte B.3) existirem e dos testes locais
estarem verdes.

1. Rode localmente antes, pra confirmar que está tudo verde (o próprio
   workflow roda de novo, mas confirmar antes economiza um ciclo se algo
   estiver quebrado):
   ```bash
   pnpm run check
   pnpm run test:unit
   pnpm run test:functions
   pnpm run test:rules
   pnpm run test:frontend:emulator
   node scripts/whatsapp-production-preflight.mjs
   ```
2. No GitHub: **Actions** → **Deploy Firebase Functions — WhatsApp
   Oficial** → **Run workflow**.
3. Branch: `main`.
4. `project_id`: `vide-digital-saas`.
5. `confirm_production`: `DEPLOY_WHATSAPP` (exatamente essa string).
6. Aguarde terminar verde.

Isso publica **só** as 7 Functions do WhatsApp
(`.github/workflows/firebase-deploy-whatsapp.yml`, `--only` explícito) —
nunca `askBusinessAI`, `askPublicBusinessAI`, nem os 15 triggers da
Auditoria Centralizada.

---

## PARTE E — Configurar o Webhook

1. Depois do deploy (Parte D), localize a URL real de `whatsappWebhook` —
   Firebase Console → Functions → `whatsappWebhook` → copiar a URL do
   trigger (formato
   `https://southamerica-east1-vide-digital-saas.cloudfunctions.net/whatsappWebhook`
   ou a URL do Cloud Run equivalente, dependendo de como o Console exibe).
2. No painel da Meta: App → WhatsApp → Configuration → **Webhook**.
3. **Callback URL**: cole a URL do passo 1.
4. **Verify Token**: digite exatamente o mesmo valor que você gravou em
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` na Parte B.3 (o `whatsappWebhook`
   compara os dois em tempo constante — se não baterem, o handshake
   falha com 403).
5. Clique em **Verify and Save**. A Meta faz uma chamada GET real pro seu
   webhook nesse momento — se falhar, confira se o deploy terminou e se o
   Verify Token está certo.
6. Em **Webhook fields**, assine (subscribe) pelo menos o campo
   **messages**.
7. Confirme que a assinatura está associada à **WABA correta** (não só ao
   App) — na Meta, é possível assinar o App sem assinar a WABA específica,
   e nesse caso nenhum evento chega.
8. **O teste "Test" do próprio painel da Meta não é suficiente** — ele só
   confirma que o endpoint responde, não que o fluxo completo (assinatura
   real, roteamento por `phone_number_id`, criação de chat) funciona. A
   validação real acontece na Parte G.

---

## PARTE F — Piloto (provisionar a conexão real)

1. Rode o preflight primeiro, com o projeto real habilitado:
   ```bash
   WHATSAPP_PREFLIGHT_PROJECT=vide-digital-saas node scripts/whatsapp-production-preflight.mjs
   ```
   Resolva qualquer item `BLOCKED`/`FAIL` antes de continuar.
2. Prepare a chave de conta de serviço do Admin SDK (a mesma usada em
   outros scripts administrativos deste projeto — `set-admin-claim.mjs`
   segue o mesmo padrão) e exporte as variáveis necessárias:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/chave.json
   export GOOGLE_CLOUD_PROJECT=vide-digital-saas
   export WHATSAPP_OWNER_UID=<uid-da-loja-no-Firestore>
   export WHATSAPP_WABA_ID=<waba-id-da-parte-a>
   export WHATSAPP_PHONE_NUMBER_ID=<phone-number-id-da-parte-a>
   export WHATSAPP_DISPLAY_NUMBER="+55 11 90000-0000"
   # opcionais:
   export WHATSAPP_META_APP_ID=<meta-app-id>
   export WHATSAPP_BUSINESS_PORTFOLIO_ID=<business-portfolio-id>
   ```
3. Rode o script, num terminal interativo de verdade (não via pipe/CI):
   ```bash
   node scripts/provision-whatsapp-pilot.mjs
   ```
4. O script pede o **token de acesso do System User** (Parte A.10) por
   prompt oculto — digite e pressione Enter. Nada aparece na tela.
5. O script **testa a conexão real com a Meta antes de gravar qualquer
   coisa** — se o teste falhar, nada é escrito, e o script encerra com uma
   mensagem de erro (sem revelar o token).
6. Se tudo der certo, o script grava:
   - o token no Secret Manager, sob `vide-whatsapp-token-<hash>`;
   - metadados (nunca o token) em `whatsapp_connections/{ownerUid}`;
   - o roteamento `whatsapp_phone_routes/{phoneNumberId} → ownerUid`;
   - um evento de auditoria (`whatsapp.conexao_provisionada`, sem PII).
7. **Não existe modo dry-run separado** — o teste de conexão real (passo
   5) já funciona como a barreira de segurança: se a Meta rejeitar, nada é
   gravado. Se você quer só validar sem nenhum risco de gravação, pare
   depois de confirmar visualmente os IDs no passo 2 e não rode o script
   ainda.
8. Ao final, o script imprime o comando exato de rollback
   (`scripts/disconnect-whatsapp-pilot.mjs`) — guarde essa linha à mão.

---

## PARTE G — Teste Real (checklist obrigatório)

Marque cada item conforme confirma manualmente. **Não marcar o WhatsApp
como CONCLUÍDO em nenhuma documentação até os 24 itens abaixo estarem
confirmados.**

1. [ ] Enviar uma mensagem real (de outro celular) pro número conectado.
2. [ ] O chat aparece na Central de Atendimento do dono (`view-atendimento`).
3. [ ] O canal do chat está marcado como `whatsapp`.
4. [ ] Nome/número aparecem mascarados na lista de conversas.
5. [ ] O CRM 360 vincula automaticamente (telefone já cadastrado) ou fica
   candidato sem vínculo automático (telefone novo) — nunca cria cliente
   sozinho.
6. [ ] Uma notificação chega pro dono/funcionário responsável.
7. [ ] Responder com texto livre dentro da janela de 24h — funciona.
8. [ ] Status da mensagem enviada passa por `accepted`.
9. [ ] Status avança para `sent`.
10. [ ] Status avança para `delivered`.
11. [ ] Status avança para `read` (depois que o destinatário abre a
    mensagem no celular).
12. [ ] "Marcar como lida" (`whatsappMarkRead`) funciona pelo painel.
13. [ ] Atualizar a página (F5) — a conversa e o histórico continuam
    corretos, sem perder mensagens.
14. [ ] Nenhuma mensagem/chat duplicado depois do F5.
15. [ ] Reenviar o mesmo evento de webhook (a Meta reentrega automaticamente
    em caso de timeout — ou simule reenviando o mesmo payload de teste, se
    tiver acesso ao painel de teste da Meta) não duplica a mensagem.
16. [ ] Um status antigo chegando fora de ordem (ex. `delivered` depois de
    já ter `read`) nunca regride o status exibido.
17. [ ] Enviar um template aprovado **fora** da janela de 24h — funciona
    (o compositor de texto livre é substituído pelo picker de templates).
18. [ ] Tentar usar um template de **outro tenant** (se você tiver dois
    tenants de teste) é negado.
19. [ ] Um funcionário com permissão só de **leitura** em "atendimento"
    não consegue enviar mensagem (nem texto nem template).
20. [ ] Outro dono/tenant não vê nem acessa essa conversa.
21. [ ] Conferir os logs das Functions (Firebase Console → Functions →
    Logs) — nenhuma linha contém texto de mensagem, telefone, `wa_id` ou
    token.
22. [ ] Se a Auditoria Centralizada estiver ativa, confirmar que os
    eventos gerados (`whatsapp.conexao_validada`,
    `whatsapp.templates_sincronizados` etc.) não têm texto de conversa,
    telefone nem `wa_id`.
23. [ ] Revisar os custos reais gerados até aqui na
    [tabela de preços vigente da Meta](https://developers.facebook.com/docs/whatsapp/pricing)
    (confirme o link atual no painel — a Meta já mudou esse modelo de
    cobrança mais de uma vez).
24. [ ] Confirmar que a desconexão (`scripts/disconnect-whatsapp-pilot.mjs`,
    ver Parte H) realmente revoga o acesso sem apagar nenhum dado — teste
    isso numa loja de teste antes de confiar nele em produção.

Só depois dos 24 itens confirmados: atualizar `docs/ROADMAP_RD3_STATUS.md`
de PARCIAL pra CONCLUÍDO (numa missão separada, dedicada a esse
fechamento documental).

---

## PARTE H — Rollback

Em qualquer etapa, se algo der errado:

1. **Parar novos envios**: nenhuma ação de código é necessária —
   `whatsappSendText`/`whatsappSendTemplate` já recusam se a conexão não
   estiver `connected` (ver `avaliarConexao()` em `send.js`). Marcar a
   conexão como `revoked` (próximo passo) já impede novos envios.
2. **Revogar a rota e desconectar**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/chave.json
   export GOOGLE_CLOUD_PROJECT=vide-digital-saas
   export WHATSAPP_OWNER_UID=<uid-da-loja>
   node scripts/disconnect-whatsapp-pilot.mjs
   ```
   Isso desabilita a versão ativa do token no Secret Manager, marca
   `whatsapp_connections/{ownerUid}.status = "revoked"` e marca o
   roteamento como revogado — **nunca apaga** chat, mensagem, cliente ou
   qualquer histórico.
3. **Apagar as Functions**, só se necessário (ex. reverter um deploy
   quebrado):
   ```bash
   gcloud functions delete whatsappWebhook whatsappSendText whatsappSendTemplate \
     whatsappMarkRead whatsappSyncTemplates whatsappConnectionStatus \
     whatsappValidateConnection --project=vide-digital-saas --region=southamerica-east1
   ```
   **Nunca** apague nenhuma outra Function (nem `askBusinessAI`,
   `askPublicBusinessAI`, nem os 15 triggers de auditoria) neste passo.
4. **Nunca apagar** `chats`, `mensagens`, `clientes` ou qualquer histórico
   de conversa em nenhuma etapa de rollback — mesmo desconectando de vez.
5. **Restaurar Rules anteriores**: só com extremo cuidado, revisando o
   diff exato do que seria revertido — um rollback de Rules mal feito pode
   reabrir um caminho de escrita que já estava fechado por um motivo real
   (ex. reabrir a criação de chat V1, já negada pela Fase B do Anonymous
   Auth). Prefira sempre um novo deploy com a correção, não um rollback
   cego de Rules.
6. **Validar a Central de Atendimento depois do rollback**: abrir o painel
   como dono, confirmar que os chats antigos (WhatsApp e de outros canais)
   continuam visíveis e respondíveis normalmente.
