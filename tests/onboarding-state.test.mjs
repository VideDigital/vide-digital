import test from 'node:test';
import assert from 'node:assert/strict';
import { criarEstadoImplantacao, chavePreferenciaImplantacao } from '../onboarding-state-core.js';

const permissoes = { podeConfigurar: true, podeCriarProduto: true };
test('novo proprietário: oito tarefas, três grupos e primeira ação contextual', () => {
    const s = criarEstadoImplantacao({ perfil: {}, produtos: 0, ...permissoes });
    assert.equal(s.concluidas, 0);
    assert.deepEqual(s.grupos.map(g => g.total), [3, 2, 3]);
    assert.equal(s.proxima.campo, 'perf-nome-loja');
});
test('parcial: endereço pendente vem antes da personalização', () => {
    const s = criarEstadoImplantacao({ perfil: { nomeLoja: 'Minha empresa', corDestaque: '#fff', fonteVitrine: 'Arial' }, produtos: 0, ...permissoes });
    assert.equal(s.proxima.campo, 'perf-slug');
    assert.equal(s.concluidas, 2);
});
test('completa: oito confirmadas sem inferir prontidão operacional', () => {
    const s = criarEstadoImplantacao({ perfil: { nomeLoja:'Empresa',urlLoja:'empresa',whatsappCentral:'11999999999',carrinhoAtivo:true,tituloHero:'Título',subtituloHero:'Descrição',instagramUser:'empresa',corDestaque:'#fff',fonteVitrine:'Arial' }, produtos:1,...permissoes });
    assert.equal(s.percentual, 100); assert.equal(s.proxima, null);
});
test('desconhecido não equivale a concluído nem a cadastro vazio confirmado', () => {
    const s = criarEstadoImplantacao(permissoes);
    assert.equal(s.concluidas,0); assert.equal(s.proxima,null);
    assert.ok(s.tarefas.every(t=>!t.conhecida));
});
test('chat depende do seu WhatsApp; carrinho é independente', () => {
    const chat = criarEstadoImplantacao({ perfil:{chatAtivo:true,whatsappCentral:'11999999999'},...permissoes });
    assert.equal(chat.tarefas[4].concluida,false);
    assert.equal(criarEstadoImplantacao({perfil:{chatAtivo:true,whatsappChat:'11999999999'}}).tarefas[4].concluida,true);
    assert.equal(criarEstadoImplantacao({perfil:{carrinhoAtivo:true}}).tarefas[4].concluida,true);
});
test('funcionário limitado só recebe próximo passo permitido', () => {
    const s = criarEstadoImplantacao({perfil:{},produtos:0,podeCriarProduto:true});
    assert.equal(s.proxima.acao,'novo-produto'); assert.ok(s.tarefas.filter(t=>t.acao!=='novo-produto').every(t=>!t.permitida));
    assert.equal(criarEstadoImplantacao({perfil:{},produtos:0}).proxima,null);
});
test('preferência isolada por ator e loja; contexto desconhecido não tem chave', () => {
    const a={initialized:true,active:true,authUid:'a',storeUid:'loja1'};
    assert.notEqual(chavePreferenciaImplantacao(a),chavePreferenciaImplantacao({...a,authUid:'b'}));
    assert.notEqual(chavePreferenciaImplantacao(a),chavePreferenciaImplantacao({...a,storeUid:'loja2'}));
    assert.equal(chavePreferenciaImplantacao({...a,active:false}),null);
});
