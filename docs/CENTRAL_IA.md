# Central de IA — RD3, entrega 1

## Objetivo

A Central de IA permite que cada loja configure antecipadamente a identidade e o comportamento da sua futura assistente virtual. Esta entrega não conecta provedores externos, não gera respostas e não ativa automações reais.

## Arquivos envolvidos

- `central-ia.js`: valores padrão, normalização, validação, estado do formulário, persistência e resumo em tempo real.
- `central-ia.css`: layout responsivo e estados visuais.
- `dashboard.html`: menu, card da Central de módulos e view acessível.
- `dashboard-app.js`: integração com navegação, permissões e contexto autenticado.
- `core/vide-context.js`: alias canônico da permissão `central-ia`.
- `sidebar-navigation.js`: posicionamento no grupo Crescimento.
- `firestore.rules`: isolamento, validação e autorização no backend.
- `tests/central-ia.test.mjs`: testes de formulário, normalização, validação e integração estrutural.
- `tests/emulator/firestore-security.test.mjs`: testes de regras e multi-tenancy.
- `scripts/seed-emulator.mjs`: funcionário local autorizado para validação manual.

## Estrutura no Firestore

Coleção: `configuracoes_ia`

Documento único por loja: `configuracoes_ia/{storeUid}`

```js
{
  ativo: false,
  nomeAssistente: "Assistente Virtual",
  mensagemApresentacao: "Olá! Sou a assistente virtual da loja. Como posso ajudar?",
  idioma: "pt-BR",
  personalidade: "amigavel",
  tamanhoResposta: "media",
  instrucoes: "",
  canais: {
    lojaPublica: false,
    sugestoesFuncionarios: false,
    respostasAutomaticas: false,
    criacaoConteudo: false,
    whatsapp: false
  },
  modoRespostaAutomatica: "nunca",
  mensagemFallback: "Não encontrei essa informação. Vou encaminhar sua pergunta para nossa equipe.",
  tenantId: "{storeUid}",
  lojaId: "{storeUid}",
  criadoPor: "{authUid}",
  criadoEm: serverTimestamp(),
  atualizadoPor: "{authUid}",
  atualizadoEm: serverTimestamp()
}
```

Abrir a tela sem documento existente carrega os padrões em memória. O documento só é criado após o clique em “Salvar configurações”. Atualizações usam `setDoc(..., { merge: true })` e preservam `criadoPor` e `criadoEm`.

## Valores e validações

- Nome: obrigatório, de 2 a 40 caracteres, com espaços externos removidos.
- Apresentação: até 300 caracteres.
- Idioma: `pt-BR`, `en`, `es` ou `automatico`.
- Personalidade: `amigavel`, `profissional`, `direta`, `consultiva`, `vendedora`, `suporte` ou `personalizada`.
- Tamanho: `curta`, `media` ou `detalhada`.
- Instruções: até 5.000 caracteres; quebras de linha são preservadas.
- Canais: cinco booleanos obrigatórios.
- Modo automático: `nunca`, `sempre`, `fora_horario` ou `sem_funcionario`.
- Fallback: obrigatório, até 300 caracteres, com espaços externos removidos.

A normalização ignora qualquer `tenantId` ou `lojaId` vindo do formulário. Esses valores são derivados exclusivamente de `VideHubContext.getSnapshot().storeUid`.

## Permissões

Chave canônica: `central-ia`.

- Proprietário e administrador: visualizam e editam.
- Funcionário com `central-ia` em `permissoes.ver`: visualiza em modo somente leitura.
- Funcionário com `central-ia` em `permissoes.editar`: visualiza e salva; “Editar” também implica “Ver” no contexto existente.
- Funcionário sem a permissão: não vê o item no menu nem o card no hub, não abre a view diretamente e não acessa o documento pelas regras.

## Isolamento multi-tenant

O UID canônico da loja já adotado pelo projeto (`storeUid/ownerUid`) é usado como ID do documento. As regras conferem:

- usuário autenticado;
- vínculo do funcionário ativo com `donoUID`;
- permissão `central-ia` para leitura ou edição;
- `tenantId` e `lojaId` iguais ao ID do documento;
- imutabilidade de `tenantId`, `lojaId`, `criadoPor` e `criadoEm` após a criação;
- autoria de criação/atualização igual ao UID autenticado;
- timestamps de criação/atualização iguais ao timestamp do servidor.

Não há consulta de coleção para carregar configurações de IA e não é necessário índice composto.

## Recursos marcados como “Em breve”

- chat na loja pública;
- sugestões para funcionários;
- respostas automáticas;
- criação de conteúdo;
- WhatsApp;
- base de conhecimento.

Os switches apenas persistem preferências. Nenhum deles inicia processamento ou chamada externa.

## Conexão futura de provedor

A fase futura deverá consumir a configuração somente em backend confiável. Chaves de provedor devem permanecer em secret manager ou configuração protegida do servidor, nunca no frontend ou no documento da loja. O backend deverá validar novamente a configuração e aplicar limites, auditoria e políticas de segurança antes de chamar qualquer modelo.

## Como testar

```bash
pnpm run check
pnpm run test:central-ia
pnpm run test:studio
pnpm run test:functions
pnpm run test:rules
pnpm run test:frontend:emulator
```

Para teste manual, inicie os emuladores e rode `pnpm run seed:emulator`. Use o proprietário local para criar e recarregar a configuração; `employee.edit@local.test` possui edição de `central-ia`; `employee.read@local.test` não possui acesso ao módulo.

Validar as larguras de 360, 390, 768, 1024 e 1440 pixels, verificando menu, resumo, campos, switches, ausência de overflow horizontal e retorno de salvamento.

## Riscos conhecidos

- A configuração não produz efeito operacional até a conexão segura de um backend de IA.
- Publicar `firestore.rules` é uma etapa de deploy separada do merge do frontend.
- O modo Master continua sujeito às claims administrativas já adotadas pelo projeto.
