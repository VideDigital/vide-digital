# Sprint 086 — latência e fallback limitado da IA

Base: `c0c0ad8772270807e2a6726e117704ba75eef449`. Branch: `fix/ai-latency-fallback-086`.
Implementação e testes para `askBusinessAI` e `askPublicBusinessAI`, sem merge, deploy ou Gemini real.

## Diagnóstico separado por evidência

**FATO COMPROVADO:** Sprint 080 registrou HTTP 503 do Gemini. No Sprint 085, uma pergunta privada fez duas tentativas internas, cada uma interrompida pelo timeout local de 20s. Não houve status HTTP do Gemini observado nessas tentativas. Nossa Function devolveu `unavailable`/HTTP 503 em aproximadamente 41,3s; a UI saiu do loading e a quota aumentou uma unidade. Isso comprova que o limite local impediu esperar mais, não que o Gemini teria respondido depois.

**HIPÓTESE:** latência do provedor, nível de thinking ou condições de rede contribuíram. **NÃO FOI POSSÍVEL COMPROVAR:** causa interna dos timeouts, disponibilidade da chave para o fallback, latência, qualidade ou recuperação em produção. Nenhum probe real nesta missão.

## Payload e modelos

Primário fixo `gemini-3.8-flash`, com `generationConfig.thinkingConfig.thinkingLevel: "low"`. O default anterior implícito era medium. O [guia oficial de thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) documenta low no REST e contabiliza thinking no limite de saída; low reduz o orçamento de raciocínio, sem garantir latência ou qualidade.

Fallback fixo `gemini-3.5-flash-lite`, estável e compatível com generateContent/texto segundo a [ficha oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Usa thinking `minimal`, suportado pelo modelo e adequado à preferência por latência. Preserva integralmente systemInstruction, contents e o limite de saída autorizados. Não substitui o primário.

Removido `temperature: 0.4`. topP, topK e candidateCount não existiam; continuam ausentes. A [documentação de atualização Gemini](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6) descreve a depreciação desses controles de amostragem e a ausência de suporte a candidateCount.

`maxOutputTokens` passa de 1024 a 2048: aumento moderado para acomodar thinking low e uma resposta curta. É teto, não consumo obrigatório; não garante que a resposta nunca ficará vazia. Se todo o teto for usado, o máximo de tokens de saída por tentativa dobra. Até duas tentativas podem ser cobradas externamente; timeout/abort não garante ausência de cobrança. [Pricing oficial](https://ai.google.dev/gemini-api/docs/pricing) inclui thinking na cobrança de saída. Não há nova unidade mensal por fallback.

## Tempo, cancelamento e política

| Limite | Anterior | Novo |
|---|---:|---:|
| Function (ambas) | 60s | 90s |
| Aplicação, desde entrada do handler | 50s | 65s |
| Tentativa primária | 20s | 35s |
| Segunda tentativa | 20s no mesmo modelo | até 25s no Lite |

O cliente existente em `core/vide-functions.js` usa Firebase JS 12.14.0 sem override; o [código oficial dessa versão](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.14.0/packages/functions/src/service.ts) fixa timeout padrão de 70s. Por isso adotamos 65s, em vez do exemplo de 75s: há 5s de margem nominal ao cliente e 25s à Function, sem depender de publicação Pages. Cold start, rede e event loop bloqueado podem consumir essas margens; não se promete ausência de timeout de infraestrutura em qualquer condição.

Máximo de transporte: 35s + espera 250–499ms + 25s < 60,5s. Autorização, leituras e reserva de quota também participam do deadline global. Cada tentativa recebe o menor entre seu teto e o tempo global restante. Cabeçalhos, cancelamento do corpo de erro e JSON estão dentro do orçamento. AbortController mais Promise.race encerram a espera mesmo quando o mock/transporte não coopera; timers são limpos.

Máximo absoluto: uma chamada primária e uma fallback. Apenas HTTP 500/502/503, rede ou timeout local permitem fallback. HTTP 400/401/403/404/429 e JSON inválido não permitem. Falha persistente e timeout retornam `unavailable`; 429 preserva `resource-exhausted` e o tratamento anterior. Resposta HTTP 200 sem texto preserva o erro funcional existente; não vira gatilho para fallback.

Leituras Firestore em andamento não são canceláveis por esse mecanismo. Quota já reservada não é reembolsada, nem reservada novamente. Deadline impede iniciar transporte tardio; uma transação iniciada antes dele pode concluir depois.

## Segurança e observabilidade

AI-01 preservado: query e allowlist pública exigem `statusProduto === "ativo"`. Tenant continua resolvido no servidor, ignorando owner enviado pelo visitante. Contexto público não carrega pedidos, leads, receita ou estoque exato. Mesmo conteúdo autorizado chega ao fallback. AI-02 preservado: total 200, público 100, reserva privada, transação e compatibilidade legada.

Cada tentativa concluída registra somente model, attempt, stage, caminho, geminiStatus, kind e durationMs. Sucesso primário gera info; sucesso fallback gera warning, sem error final. Erros usam marcadores sintéticos, sem exceção bruta do transporte. O deadline global tem um único error de metadados; não duplica o erro da tentativa abortada. HTTP 200 registra sucesso de transporte, não comprovação de resposta útil.

Não registrar chave, URL com chave, prompt, pergunta, histórico, tenant ou resposta integral. Logs existentes de falha funcional permanecem sanitizados e são exercitados pelos testes.

## Validação e limites do release

Testes com relógio virtual e handlers reais/infrastrutura substituída cobrem resposta primária saudável em 21s e 34s, fallback saudável em 24s, falhas transitórias e persistentes, status não elegíveis, máximo de duas requests, deadlines incluindo pré-transporte/JSON, débito único, catálogo e isolamento A/B no fallback, payload e logs seguros. A suíte 077 preserva concorrência, legado e os tetos mensais.

Mutation testing deve detectar thinking medium/default, timeout 20s, remoção/loop/terceira tentativa, fallback em 404/429, débito duplo, temperature, remoção do filtro ativo e público 200. Resultados e restauração constam no relatório da missão.

Workflow existente da IA permanece sem alteração: `functions:askBusinessAI,functions:askPublicBusinessAI`, com gates e execução manual. Nenhuma mudança em frontend, outras Functions, Rules, Storage, indexes, Auth, IAM, Secrets, App Check ou WhatsApp. PR #103 intocada. Deploy e smoke real dependem de autorizações posteriores; implementação local não encerra o B1 de produção.
