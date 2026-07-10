(function iniciarProtecaoGlobal(){
    const LIMITE = 30;
    const CHAVE = "videAuraErrosRecentes";
    function salvar(registro){
        try{
            const atual = JSON.parse(localStorage.getItem(CHAVE) || "[]");
            atual.unshift(registro);
            localStorage.setItem(CHAVE, JSON.stringify(atual.slice(0, LIMITE)));
        }catch(_erro){}
    }
    window.addEventListener("error", function(evento){
        salvar({tipo:"error",mensagem:String(evento.message||"Erro desconhecido"),arquivo:evento.filename||"",linha:evento.lineno||0,coluna:evento.colno||0,data:Date.now()});
    });
    window.addEventListener("unhandledrejection", function(evento){
        const motivo = evento.reason instanceof Error ? evento.reason.message : String(evento.reason||"Promise rejeitada");
        salvar({tipo:"promise",mensagem:motivo,data:Date.now()});
    });
    window.VideAuraDiagnostics = {
        listarErros(){ try{return JSON.parse(localStorage.getItem(CHAVE)||"[]");}catch(_erro){return[];} },
        limparErros(){ localStorage.removeItem(CHAVE); }
    };
})();
