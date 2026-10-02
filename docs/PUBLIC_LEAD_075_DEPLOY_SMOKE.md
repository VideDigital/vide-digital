# Public Lead 075 — publicação e smoke controlados

Canal preparado pela missão 076. Este documento não autoriza merge, deploy ou smoke.

## Autorizações separadas

1. Revisar e autorizar merge da PR do canal, após QG 4/4 do HEAD exato.
2. Aguardar QG oficial push/main do SHA resultante. Obter autorização explícita desse SHA para deploy exclusivamente de `functions:createPublicLead`, projeto `vide-digital-saas`.
3. Só então despachar `Deploy Function — Public Lead 075`, inputs `confirmacao=PUBLICAR` e `sha=<SHA completo autorizado>`. Não executar outro canal.
4. O workflow verifica identidade, checkout, QG oficial 4/4 e escopo, usa WIF existente ou fallback já configurado, faz dry-run e reconsulta main antes da publicação. Falha de autenticação/permissão: parar, sem corrigir IAM/Secrets.

O dry-run do Firebase CLI pode habilitar APIs; não é leitura pura. Está preparado para a missão futura de deploy e NÃO foi executado na 076. O gate importa o módulo puro já usado para validar QG exato; não executa workflow, API ou artefato de Pages.

## Evidência anterior e inventário

Preflight 076: `createPublicLead` GEN_2, ACTIVE, `southamerica-east1`, revisão `createpubliclead-00003-quv`, updateTime `2026-08-27T12:48:19.850847200Z`. Confirmar novamente antes do deploy e registrar inventário de revisões/updateTime das Functions. Após deploy, comparar inventário: somente createPublicLead pode ter sido publicada. Nome/projeto/região/state/revisão/updateTime/run/SHA devem constar do relatório; não registrar tokens ou credenciais.

## Smoke futuro — uma captura QA, sem cliente real

Pré-requisito: autorização explícita para smoke, criação e limpeza da fixture, sessão administrativa autorizada e deploy concluído. O único tenant permitido é **Vide Hub QA - Testes**, slug `vide-hub-qa-testes`.

1. Confirmar projeto/banco e ler `vitrines_publicas/vide-hub-qa-testes` para resolver donoUID vivo. Validar a página/LP publicada e sua associação ao mesmo QA; não reutilizar UID histórico. Divergência ou fixture já existente: parar e relatar.
2. Registrar o estado anterior do tenant QA e a janela UTC do teste. Escolher um identificador único `QA-SMOKE-PUBLIC-LEAD-075-<timestamp>`. Usar apenas dados sintéticos aprovados; email pode usar `example.invalid`. Se a UI exigir telefone, confirmar uma fixture numérica de teste que não pertença a pessoa real. Não inventar contato entregável nem acionar comunicação externa.
3. Abrir loja/LP QA na interface pública. Preencher uma única captura, submeter uma vez e aguardar sucesso. Não repetir automaticamente em timeout/resposta ambígua: primeiro procurar a fixture para evitar duplicação.
4. Confirmar administrativamente exatamente um lead criado e confirmar sua presença na Central Comercial do QA. Registrar apenas ID técnico, campos de controle e resultado; omitir conteúdo privado de outros documentos.
5. Conferir `criadoPor` igual ao donoUID vivo, `tenantId` e demais campos conforme o contrato da 075, origem, status e campos básicos sintéticos. Se algum campo for derivado ou opcional pelo contrato, registrar o valor/ausência real, sem inventar equivalência.
6. Confirmar ausência de escrita em outro tenant usando a evidência da chamada e busca administrativa estritamente pelo identificador único da fixture. Não navegar conteúdo de clientes reais nem executar tentativas cross-tenant. Isso comprova o alcance desta fixture; não é prova universal de isolamento.
7. Remover somente o documento QA criado nesta execução e eventuais artefatos de teste identificados e autorizados; preservar fixtures prévias. Confirmar remoção por nova leitura. Não apagar logs operacionais. Se limpeza estiver bloqueada, registrar o ID pendente e parar.

Não testar XFF spoofing, esgotamento de 60 requisições, DoS ou falhas forçadas em produção. Testes adversariais ficam nos emuladores. Não misturar IA pública, quotas, Gemini ou outros serviços.

## Observabilidade e encerramento

Comparar uma janela anterior equivalente e acompanhar 10–15 minutos após deploy/smoke: execuções e 5xx de createPublicLead, resource-exhausted, unavailable e Cloud Logging restrito à Function/horário. Baixo volume ou zero erro não provam ausência de defeito; relatar denominador e duração observados. Não alterar alertas.

Se houver erro inesperado, revisão divergente, Function adicional publicada ou impacto fora do QA: interromper, preservar metadados e pedir decisão separada; não corrigir código, fazer redeploy/rollback ou repetir probes automaticamente.

Relatório futuro: SHA autorizado, run/attempt de deploy, revisão anterior/nova, inventário comparado, resultado único do smoke, propriedade QA, limpeza e observabilidade. Merge do canal, deploy e smoke permanecem operações distintas, cada uma com sua autorização. HARD STOP.
