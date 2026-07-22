# Deploy manual do backend Firebase

Este workflow prepara uma publicação controlada somente dos recursos autorizados do backend:

- as Functions `sendAdminChatMessage` e `incrementPublicMetric`;
- as regras definidas em `firestore.rules`;
- os índices do Firestore definidos em `firestore.indexes.json`.

Ele não publica Hosting, regras do Storage ou outras Functions. O workflow só pode ser iniciado manualmente na branch `main`, exige uma confirmação escrita e bloqueia IDs que contenham `demo`.

## 1. Descobrir o ID real do projeto

1. Abra o [Firebase Console](https://console.firebase.google.com/).
2. Selecione o projeto de produção do Vide Hub.
3. Abra **Configurações do projeto**.
4. Na aba **Geral**, copie o campo **ID do projeto**.
5. Compare o ID com os aplicativos e domínios exibidos nessa página e confirme com a pessoa responsável pelo ambiente de produção.

O repositório não possui `.firebaserc`. O frontend publicado em `firebase-init.js` usa o projeto `vide-digital-saas`, e o workflow recusa qualquer outro ID para impedir que as Rules sejam publicadas em um projeto diferente. O valor `demo-vide-hub` pertence somente aos emuladores.

## 2. Criar uma conta de serviço exclusiva

No Google Cloud Console do projeto confirmado:

1. Abra **IAM e administrador** → **Contas de serviço**.
2. Crie uma conta dedicada ao deploy do GitHub Actions, com um nome que deixe clara essa finalidade.
3. Não use uma conta pessoal e não conceda os papéis básicos **Owner** ou **Editor**.
4. Conceda somente os papéis necessários descritos na seção de permissões abaixo.
5. Restrinja o papel **Service Account User** à conta de serviço de runtime realmente usada pelas Functions.

## 3. Baixar e proteger a chave JSON

1. Abra a conta de serviço criada.
2. Entre em **Chaves** → **Adicionar chave** → **Criar nova chave**.
3. Escolha **JSON** e faça o download.
4. Trate o arquivo como uma senha: não envie por chat, não coloque no repositório e não compartilhe seu conteúdo.

Chaves JSON são credenciais de longa duração. Esta primeira versão usa esse formato conforme solicitado; no futuro, prefira Workload Identity Federation para eliminar a chave permanente.

## 4. Adicionar o secret de deploy

No GitHub, abra:

**Settings** → **Secrets and variables** → **Actions** → **Secrets** → **New repository secret**

Crie um secret com o nome exato:

`FIREBASE_SERVICE_ACCOUNT`

Cole como valor todo o conteúdo do arquivo JSON, incluindo as chaves de abertura e fechamento. Não adicione o JSON como variável comum do repositório.

## 5. Como este workflow fica seguro sem aprovação manual de Environment

O job `deploy` **não** usa mais `environment: production` — por isso não há uma etapa de "aguardando revisor" no GitHub antes do deploy. Essa proteção foi substituída por várias camadas que já existiam e continuam obrigatórias, todas na própria definição do workflow (não dependem de configuração manual no GitHub que possa ficar desatualizada ou ser esquecida):

- só pode ser disparado manualmente (`workflow_dispatch`), nunca em push ou PR;
- exige `project_id` exato (`vide-digital-saas`) — qualquer outro valor, incluindo IDs com `demo`, encerra a execução;
- exige a confirmação literal `DEPLOY` no campo `confirm_production`;
- só roda a partir da branch `main`;
- usa `concurrency` (só uma execução de deploy por vez);
- o job `deploy` depende (`needs`) do job `validate-and-test` — toda a suíte de testes (sintaxe, Central de IA, Studio, Functions, Rules e o smoke test do frontend no Emulator) precisa passar antes de qualquer autenticação;
- a autenticação só acontece via o secret `FIREBASE_SERVICE_ACCOUNT`.

Se sua organização exigir um revisor humano antes do deploy, é possível reativar isso adicionando de volta `environment: production` ao job `deploy` neste arquivo e configurando revisores obrigatórios nas configurações do Environment — mas isso é opcional a partir de agora, não é mais um requisito do workflow.

## 6. Permissões mínimas no Google Cloud

A conta usada pelo GitHub deve começar com o menor conjunto possível:

- **Cloud Functions Developer** (`roles/cloudfunctions.developer`) para atualizar as Functions existentes;
- **Service Account User** (`roles/iam.serviceAccountUser`), limitado à conta de runtime utilizada pelas Functions;
- **Firebase Rules Admin** (`roles/firebaserules.admin`) para publicar as regras do Firestore;
- **Cloud Datastore Index Admin** (`roles/datastore.indexAdmin`) para publicar os índices do Firestore definidos no repositório.

Functions de segunda geração usam Cloud Build, Artifact Registry e Cloud Run internamente. Dependendo da configuração atual do projeto, a conta de build ou o agente de serviço já existente poderá precisar de permissões específicas, como **Cloud Build Service Account** e **Artifact Registry Writer**, limitadas aos recursos envolvidos. Não conceda essas permissões preventivamente à conta do GitHub: faça isso somente após identificar uma mensagem de permissão concreta e revisar o recurso indicado.

Não conceda **Service Usage Admin** ao workflow. As APIs necessárias, o Artifact Registry e o billing devem estar configurados previamente por um administrador. Se algo estiver ausente, o deploy deve falhar para análise em vez de alterar automaticamente APIs, IAM ou cobrança.

As permissões exatas podem variar conforme a geração, a conta de runtime e a configuração atual das Functions. Neste repositório, as duas Functions são callables de segunda geração na região `southamerica-east1`.

## 7. Executar o workflow

1. Abra **Actions** no GitHub.
2. Selecione **Deploy Firebase Backend**.
3. Clique em **Run workflow**.
4. Selecione a branch `main`.
5. Em `project_id`, informe o ID real e confirmado do projeto de produção.
6. Em `confirm_production`, digite exatamente `DEPLOY`.
7. Inicie a execução e acompanhe os testes na aba **Actions**.

Qualquer valor vazio, um ID contendo `demo`, outra branch ou uma confirmação diferente de `DEPLOY` encerra a execução antes da autenticação.

## 8. Acompanhar e conferir o resultado

Abra a execução na aba **Actions** e acompanhe cada etapa. A ordem esperada é:

1. validação da solicitação;
2. configuração do pnpm (versão fixa `11.9.0`, a mesma do campo `packageManager` do `package.json`) e do Node.js 22;
3. configuração do Java 21 no runner com `actions/setup-java@v5` (precisa vir antes dos testes que sobem o Firestore Emulator);
4. instalação com lockfile congelado (`pnpm install --frozen-lockfile`);
5. `pnpm run check` (sintaxe de todos os arquivos do projeto);
6. `pnpm run test:central-ia`;
7. `pnpm run test:studio`;
8. `pnpm run test:functions`;
9. `pnpm run test:rules` (regras do Firestore e do Storage no Emulator);
10. `pnpm run test:frontend:emulator` (smoke test de ponta a ponta no Emulator);
11. autenticação com o secret `FIREBASE_SERVICE_ACCOUNT`;
12. deploy de `firestore.rules` no projeto `vide-digital-saas`;
13. deploy de `sendAdminChatMessage` e `incrementPublicMetric`;
14. deploy de `firestore.indexes.json`.

**Versões exigidas** (as mesmas nos dois jobs do workflow, `validate-and-test` e `deploy`):

| Ferramenta | Versão | Por quê |
|---|---|---|
| Node.js | `22` (>= 22.13.0) | `pnpm@11.9.0` (fixado em `packageManager` no `package.json`) exige Node >= 22.13; rodar em Node 20 faz o próprio pnpm abortar com "This version of pnpm requires at least Node.js v22.13". |
| pnpm | `11.9.0` (fixo, via `pnpm/action-setup`) | Mesma versão do campo `packageManager`, pra instalação determinística — nunca "latest". |
| Java | `21` (Temurin) | Exigido pelo Firestore Emulator usado em `test:rules` e `test:frontend:emulator`. O computador local pode ter uma versão mais antiga (ex.: Java 8); o workflow instala o 21 só no runner temporário do GitHub Actions. |

Se `pnpm run check` ou qualquer teste falhar, o job `deploy` nunca inicia — a dependência `needs: validate-and-test` garante isso mesmo sem Environment/aprovação manual.

As regras são publicadas antes das Functions para que uma falha independente no deploy das Functions não mantenha políticas antigas no Firestore. Nos logs, confirme que o primeiro comando contém apenas:

`firestore:rules`

E que o segundo contém apenas:

`functions:sendAdminChatMessage,functions:incrementPublicMetric`

E que o terceiro contém apenas:

`firestore:indexes`

O deploy de índices publica somente as definições presentes em `firestore.indexes.json`. A criação ou atualização de um índice pode continuar processando no Firebase por alguns minutos depois que o comando terminar; durante esse período, consultas que dependem do índice podem permanecer indisponíveis até o status ficar pronto no Firebase Console.

Não prossiga se aparecer solicitação para habilitar APIs, configurar billing, mudar região ou geração, alterar IAM, criar secrets, substituir ou excluir outras Functions. O modo não interativo deve encerrar a execução quando uma confirmação for necessária; revise os logs antes de tentar novamente.

## 9. Revogar ou substituir uma chave exposta

Se houver qualquer suspeita de exposição:

1. abra a conta de serviço no Google Cloud Console;
2. entre em **Chaves** e exclua imediatamente a chave comprometida;
3. crie uma nova chave JSON;
4. substitua o valor do secret `FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions → Secrets);
5. revise os logs de auditoria e as execuções recentes;
6. nunca reutilize a chave revogada.

Excluir ou substituir o secret no GitHub não revoga a chave no Google Cloud. A revogação precisa ser feita também na conta de serviço.
