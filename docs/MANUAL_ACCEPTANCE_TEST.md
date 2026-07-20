# Manual Acceptance Test — Vide Hub V1

Roteiro para validação local com Firebase Emulator. Não use projeto, credenciais ou dados reais de produção.

## 1. Pré-requisitos

- Node.js 20 ou superior.
- Java 11 ou superior. Nos testes desta fase foi usado Java 17 portátil.
- pnpm 11.9.0 ou compatível.

Se o terminal não encontrar `node`, adicione o diretório do Node ao `PATH` da sessão antes de rodar os comandos.

## 2. Instalação

Na raiz do repositório:

```bash
pnpm install
```

O projeto usa workspace pnpm para instalar também `functions/`.

## 3. Testes automatizados

Execute:

```bash
pnpm run check
pnpm run test:rules
pnpm run test:functions
pnpm run test:frontend:emulator
pnpm run test:all
```

`test:all` executa checagem de sintaxe, Firestore Rules, Storage Rules, Functions unitárias e smoke do frontend com Auth/Firestore/Functions Emulator.

## 4. Iniciar Emulator para teste manual

```bash
pnpm run emulators
```

Portas:

- Emulator UI: `http://127.0.0.1:4000`
- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001`
- Storage: `127.0.0.1:9199`
- Project ID local: `demo-vide-hub`

## 5. Popular dados locais

Com os Emulators Auth e Firestore ativos:

```bash
pnpm run seed:emulator
```

O seed recusa execução fora de localhost e usa somente `demo-vide-hub`.

Contas locais:

- `owner.pending@local.test` / `Local123!pending`
- `owner.basic@local.test` / `Local123!basic`
- `owner.pro@local.test` / `Local123!pro`
- `employee.read@local.test` / `Local123!read`
- `employee.edit@local.test` / `Local123!edit`
- `employee.inactive@local.test` / `Local123!inactive`
- `admin.claim@local.test` / `Local123!admin`
- `admin.doc.only@local.test` / `Local123!doc`

## 6. Abrir o frontend local

Sirva os arquivos HTML por um servidor estático local e abra com flag explícita:

```text
http://127.0.0.1:8000/login.html?useEmulator=true
```

Também é possível habilitar por console em localhost:

```js
localStorage.setItem("videUseEmulator", "true")
```

O app só conecta aos Emulators em host seguro (`localhost`, `127.0.0.1` ou `::1`) e com flag explícita.

## 7. Fluxos manuais mínimos

Owner:

1. Entrar como `owner.pro@local.test`.
2. Confirmar Dashboard, Produtos, Pedidos, Leads e Configurações.
3. Criar/editar produto.
4. Criar funcionário pela UI e confirmar chamada de Function.

Funcionários:

1. Entrar como `employee.read@local.test` e confirmar leitura sem escrita.
2. Entrar como `employee.edit@local.test` e confirmar escrita em módulos permitidos.
3. Entrar como `employee.inactive@local.test` e confirmar bloqueio.

Admin:

1. Entrar como `admin.claim@local.test`.
2. Confirmar acesso admin.
3. Entrar como `admin.doc.only@local.test` e confirmar que documento em `equipe_admin` sem claim não concede privilégio backend.

Loja pública:

1. Abrir `loja.html?loja=loja-pro-local&useEmulator=true`.
2. Confirmar vitrine/produtos.
3. Clicar oferta e confirmar métrica/lead via Functions.
4. Testar chat público.

Landing Page:

1. Abrir fluxo de Landing Pages.
2. Enviar formulário público com `useEmulator=true`.
3. Confirmar lead criado via `createPublicLead`.

Master Mode:

1. Testar apenas com admin com claim.
2. Confirmar que query string/localStorage não concede acesso backend por si só.
3. Sair do Master Mode e recarregar.

## 8. Reset local

Pare os Emulators com `Ctrl+C`. Dados locais sem export/import são descartados ao reiniciar.

Não execute `firebase deploy` neste fluxo.
