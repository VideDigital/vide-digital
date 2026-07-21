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

O repositório não possui `.firebaserc`. Portanto, nenhum alias local comprova qual projeto é produção. O valor `demo-vide-hub` pertence aos emuladores e é recusado pelo workflow. Não use um ID apenas porque ele parece correto.

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

## 4. Adicionar o secret ao Environment de produção

No GitHub, abra:

**Settings** → **Secrets and variables** → **Actions** → **Environments** → **production** → **Environment secrets**

Crie um secret com o nome exato:

`FIREBASE_SERVICE_ACCOUNT`

Cole como valor todo o conteúdo do arquivo JSON, incluindo as chaves de abertura e fechamento. Não adicione o JSON como variável comum do repositório.

## 5. Exigir aprovação manual

Nas configurações do Environment `production`, ative as regras de proteção disponíveis e adicione revisores obrigatórios. Assim, depois que os testes passarem, o job de deploy ficará aguardando aprovação antes de receber acesso ao secret.

A disponibilidade de revisores obrigatórios pode variar conforme o plano e a visibilidade do repositório. Se a opção não aparecer, não execute o workflow até definir um processo de aprovação equivalente.

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
7. Inicie a execução.
8. Aguarde os testes e, quando solicitado, peça ao revisor do Environment `production` que confira o projeto antes de aprovar.

Qualquer valor vazio, um ID contendo `demo`, outra branch ou uma confirmação diferente de `DEPLOY` encerra a execução antes da autenticação.

## 8. Acompanhar e conferir o resultado

Abra a execução na aba **Actions** e acompanhe cada etapa. A ordem esperada é:

1. validação da solicitação;
2. instalação com lockfile congelado;
3. `pnpm run check`;
4. `pnpm run test:functions`;
5. configuração temporária do Java 21 no runner com `actions/setup-java@v5`;
6. `java -version`;
7. `pnpm run test:rules`;
8. aprovação do Environment e autenticação;
9. deploy de `sendAdminChatMessage` e `incrementPublicMetric`;
10. deploy de `firestore.rules`;
11. deploy de `firestore.indexes.json`.

O computador local pode ter apenas Java 8 (`1.8.0_481`), enquanto o Firebase Emulator exige Java 11 ou superior. O workflow instala Java 21 apenas no runner temporário do GitHub Actions, antes de `pnpm run test:rules`, e o teste completo é validado pela execução do GitHub Actions antes de qualquer autenticação ou deploy.

As regras só são publicadas se o deploy das duas Functions terminar com sucesso. Nos logs, confirme que o primeiro comando contém apenas:

`functions:sendAdminChatMessage,functions:incrementPublicMetric`

E que o segundo contém apenas:

`firestore:rules`

E que o terceiro contém apenas:

`firestore:indexes`

O deploy de índices publica somente as definições presentes em `firestore.indexes.json`. A criação ou atualização de um índice pode continuar processando no Firebase por alguns minutos depois que o comando terminar; durante esse período, consultas que dependem do índice podem permanecer indisponíveis até o status ficar pronto no Firebase Console.

Não prossiga se aparecer solicitação para habilitar APIs, configurar billing, mudar região ou geração, alterar IAM, criar secrets, substituir ou excluir outras Functions. O modo não interativo deve encerrar a execução quando uma confirmação for necessária; revise os logs antes de tentar novamente.

## 9. Revogar ou substituir uma chave exposta

Se houver qualquer suspeita de exposição:

1. abra a conta de serviço no Google Cloud Console;
2. entre em **Chaves** e exclua imediatamente a chave comprometida;
3. crie uma nova chave JSON;
4. substitua o valor de `FIREBASE_SERVICE_ACCOUNT` no Environment `production`;
5. revise os logs de auditoria e as execuções recentes;
6. nunca reutilize a chave revogada.

Excluir ou substituir o secret no GitHub não revoga a chave no Google Cloud. A revogação precisa ser feita também na conta de serviço.
