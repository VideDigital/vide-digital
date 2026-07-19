# Security Findings Phase 1

## P0 crítico

- Não há `firestore.rules`, `storage.rules`, `firebase.json` ou `.firebaserc` versionados no repositório. Não é possível confirmar isolamento real de tenant apenas pelo código frontend.
- Antes desta fase, funcionário autenticado no Firebase Auth podia falhar no login porque o fluxo validava principalmente `usuarios/{uid}` e ignorava `funcionarios/{uid}`.
- Desativar funcionário em `funcionarios/{uid}.status` não desativa automaticamente a conta no Firebase Authentication.

## P1 alto

- `usuarioUID` é usado como identidade de dados em grande parte do Dashboard. Isso exige cuidado em modo funcionário e modo Master.
- Modo Master dependia de checagens repetidas no frontend, incluindo e-mail administrativo escrito diretamente.
- `localStorage` era usado para pré-bloqueio visual de plano. Isso não deve ser confundido com autorização real.
- A criação de funcionário ainda usa Firebase App secundário no navegador com `createUserWithEmailAndPassword`.

## P2 médio

- Permissões de funcionário existiam como arrays, mas não havia contexto central para `canView`/`canEdit`.
- Escritas de vários módulos dependem de funções globais e `onclick`/handlers legados.
- Alguns fluxos de erro exibem mensagens genéricas e ainda podem variar por tela.

## P3 melhoria

- Consolidar tabela de planos compartilhada entre admin e dashboard.
- Remover duplicação futura de `FEATURES_PLANO`.
- Migrar auditoria de ações para incluir `authUid`, `ownerUid`, `storeUid` e origem da ação.
- Criar testes automatizados com usuários fake/emulador Firebase.

## Mudanças desta fase

- Adicionado `core/vide-context.js`.
- Login passa a aceitar proprietário, funcionário ativo e admin por um resolvedor central.
- Dashboard passa a separar `authUid` de `effectiveUid/storeUid` no contexto.
- Modo Master passa a ser validado pelo contexto.
- Funcionário é bloqueado no `admin.html`.
- Permissões de navegação e alguns pontos de escrita passam por `canView`/`canEdit`.

## Limitações assumidas

- Regras Firebase não foram publicadas porque não existem no repositório.
- As validações de frontend reduzem risco operacional, mas não substituem regras de segurança no Firebase.
- Nem todas as escritas globais foram migradas; esta fase cria a base e protege pontos principais.

## Atualização após revisão técnica do PR #5

- Escritas operacionais de produtos, pedidos, leads, templates, campanhas, configurações, funcionários e Landing Pages receberam guards no ponto de execução.
- Ações destrutivas revisadas validam permissão antes da confirmação e novamente antes da escrita quando há callback assíncrono.
- Cadastro com Google usa o resolvedor central antes de criar `usuarios/{uid}` e não cria proprietário quando o UID já pertence a funcionário, dono ou admin confirmado.
- `equipe_admin` deixou de ser dependência fatal para login comum.
- `landing-pages` foi separado de `configuracoes` para impedir que edição de configurações conceda Studio automaticamente.
- Notificação lida permanece exceção de preferência do usuário e grava o `authUid` de quem leu.
- O arquivo `docs/WRITE_PERMISSION_AUDIT.md` detalha cada escrita revisada, guard aplicado e exceções justificadas.

## Bloqueios que continuam fora do frontend

- Firestore Rules e Storage Rules precisam aplicar isolamento e permissões reais.
- Criação, desativação e auditoria de funcionários devem migrar para Cloud Functions.
- Modo Master deve depender de regra backend auditável, não apenas de frontend.
