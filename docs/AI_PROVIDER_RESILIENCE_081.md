# Sprint 081 — resiliência limitada do Gemini

Base: 64aef85b1ffc1d5080a0812ba25c8cd53de12fa6. Branch: fix/ai-provider-resilience-081.
Escopo: askBusinessAI e askPublicBusinessAI; código/testes, sem merge ou deploy.

## Evidência e diagnóstico

FATO COMPROVADO: no smoke 080, privado recebeu Gemini 503; público atingiu timeout 504 e depois registrou Gemini 503. Sem resposta útil; quota passou de 1/0 para 3/1, sem retry. Controle QA restaurado. Não há evidência de billing esgotado, 429, modelo 404 ou chave inválida.

Consulta live em 07/10/2026: ambas ACTIVE, timeoutSeconds=60; revisões askbusinessai-00015-hol e askpublicbusinessai-00004-cek. Main/QG 37474589547 correspondem à base, 4/4 SUCCESS. PR #103 preservada como draft.

Código anterior: fetch sem AbortController/deadline e sem retry. Tempo do provedor pode exceder a Function; isso explica a exposição ao timeout, não a causa interna do 503. HIPÓTESE: indisponibilidade/capacidade do provedor. Causa interna, billing, acesso do projeto a outro modelo e recuperação do serviço NÃO FOI POSSÍVEL COMPROVAR sem novo probe, proibido nesta missão.

## Modelo e fontes oficiais

Fixado gemini-3.8-flash. Google o lista como Stable, entrada/saída texto e generateContent compatíveis: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash (consultado 07/10/2026). O payload existente mantém systemInstruction, contents, generationConfig/maxOutputTokens/temperature; nenhum parâmetro thinking minimal é enviado. Contrato de payload e resposta exercitado por mocks dos handlers. Isso não comprova acesso real da chave, qualidade ou latência em produção.

Pinning elimina a troca implícita do alias latest; NÃO corrige nem garante ausência de 503. Sem fallback: qualidade/custo/benefício e acesso a outro modelo não comprovados. Avaliar como B2 com autorização própria.

Retry orientado pela documentação oficial: https://ai.google.dev/gemini-api/docs/troubleshooting — backoff, jitter e máximo de tentativas para falhas transitórias. Política deliberadamente restrita: 500/502/503, rede e timeout local. Não repetir 400/401/403/404/429 ou erro de JSON. O tratamento explícito existente de 429 é mantido; sua mensagem de créditos não é diagnóstico de billing desta missão.

## Orçamento de tempo e custo

- Function explicitamente 60s, igual ao timeout vivo.
- Deadline de aplicação 50s a partir da entrada do handler: inclui autorização, leituras, quota e transporte; retorna unavailable com margem de 10s para infraestrutura. É um orçamento de aplicação, não garantia contra bloqueio do event loop ou cold start extremo.
- Cada tentativa Gemini: 20s incluindo cabeçalhos e decodificação JSON; AbortController e Promise.race impedem espera ilimitada mesmo se transporte não cooperar.
- Máximo duas tentativas (uma inicial + um retry). Espera 250–499ms, jitter injetável; custo de transporte máximo aproximado 40,5s, respeitando também o deadline total.
- Deadline cancela transporte em curso e impede nova chamada tardia. Leituras Firestore já em andamento não são canceláveis por essa API. Uma transação de quota iniciada antes do deadline pode concluir depois; não há refund/reset inseguro nem nova tentativa de débito pelo retry.
- Quota permanece global 200, público 100, legado conservador e reserva privada. Cada pergunta aceita reserva uma única unidade antes de carregar contexto/Gemini; retry reutiliza payload e não chama quota.
- Uma unidade mensal pode agora representar até duas tentativas externas, portanto o custo externo por pergunta pode aumentar. Não são 400 unidades mensais; não se promete que abortar o cliente desfaz custo no provedor.

## Erros e logs

Falha persistente/timeout/rede devolvem HttpsError unavailable; 429 continua resource-exhausted e 404 tem mensagem controlada de modelo. JSON inválido também unavailable, sem retry. Resposta sem texto preserva contrato existente de internal, independente do timeout de transporte.

Tentativa transitória intermediária gera warn; falha final um único error com Error sintético/stack e campos allowlist model, attempt, caminho, kind, geminiStatus, durationMs. Deadline total possui log próprio e suprime log final tardio do transporte. Não loga erro de rede original (pode conter URL/secret), corpo do provedor, key, prompt, histórico ou tenant. Sucesso permanece silencioso para preservar instrumentação existente.

## Testes e release

Relógio virtual testa timers, cancelamento, JSON pendente, deadline durante leituras/transporte e bloqueio de chamada tardia. Testes reais de handlers verificam duas tentativas com uma unidade e payload idêntico. Suíte 077 preserva quota/legado/reserva/concorrência, validação, query, allowlist e isolamento A/B. Instrumentação mantém assertions de Error/stack/PII, adaptadas à allowlist nova e ao warning intermediário; erro de rede original deixa de ser esperado por segurança.

Workflow existente firebase-deploy-ai-b1-077.yml inalterado, escopo exato functions:askBusinessAI,functions:askPublicBusinessAI. Nenhum recurso adicional, Secrets/IAM/App Check/Rules/Storage/indexes/WhatsApp/frontend alterado. Sem Gemini real ou fixture de produção nesta missão.

Após PR draft e QG completo, parar. Merge e deploy exigem autorizações separadas. Novo smoke real somente após integração, QG da main e deploy autorizado. Resultados finais e mutations registrados no relatório da missão/PR; não confundir testes mockados com disponibilidade real.
