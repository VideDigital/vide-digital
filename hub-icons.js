(function configurarIconesDoHub() {
    const iconesModulos = {
        "view-perfil": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path>
                <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V20.5h-3v-.11a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06-2.12-2.12.06-.06A1.8 1.8 0 0 0 6.6 15a1.8 1.8 0 0 0-1.65-1.1H4.5v-3h.45A1.8 1.8 0 0 0 6.6 9.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.12-2.12.06.06a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.65V4.3h3v.11a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06 2.12 2.12-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.45v3h-.45A1.8 1.8 0 0 0 19.4 15Z"></path>
            </svg>
        `,

        "view-dominios": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M10.5 13.5a4 4 0 0 0 5.66 0l2.34-2.34a4 4 0 0 0-5.66-5.66l-1.34 1.34"></path>
                <path d="M13.5 10.5a4 4 0 0 0-5.66 0L5.5 12.84a4 4 0 0 0 5.66 5.66l1.34-1.34"></path>
            </svg>
        `,

        "view-leads": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="9" cy="8" r="3"></circle>
                <path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path>
                <circle cx="17" cy="9" r="2.3"></circle>
                <path d="M15.5 14.8A4.6 4.6 0 0 1 21 19"></path>
            </svg>
        `,

        "view-automacao-leads": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M13.2 2.8 5.5 13h6l-.7 8.2L18.5 11h-6l.7-8.2Z"></path>
            </svg>
        `,

        "view-templates": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"></path>
                <path d="M7.5 10h9M7.5 13h6"></path>
            </svg>
        `,

        "view-campanhas": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m4 13 13-5v8L4 12v1Z"></path>
                <path d="M7 13.5 8.5 19h3L10 14.5M18 10a4 4 0 0 1 0 4"></path>
            </svg>
        `,

        "view-landing-pages": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="4" width="18" height="14" rx="2"></rect>
                <path d="M3 8h18M8 21h8M12 18v3"></path>
            </svg>
        `,

        "view-pedidos": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M6 4h12v17H6z"></path>
                <path d="M9 4a3 3 0 0 1 6 0M9 9h6M9 13h6M9 17h4"></path>
            </svg>
        `,

        "view-metricas": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>
            </svg>
        `,

        "view-notificacoes": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path>
                <path d="M10 21h4"></path>
            </svg>
        `,

        "view-personalizacao": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-.7a1.5 1.5 0 0 1 0-3H15a6 6 0 0 0 6-6c0-3-3.8-5.4-9-5.4Z"></path>
                <circle cx="7.5" cy="10" r=".8" fill="currentColor" stroke="none"></circle>
                <circle cx="10" cy="6.8" r=".8" fill="currentColor" stroke="none"></circle>
                <circle cx="14" cy="6.8" r=".8" fill="currentColor" stroke="none"></circle>
                <circle cx="17" cy="9.5" r=".8" fill="currentColor" stroke="none"></circle>
            </svg>
        `,

        "view-guia": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"></path>
                <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"></path>
            </svg>
        `,

        "view-funcionarios": `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="3"></circle>
                <circle cx="17" cy="9" r="2.5"></circle>
                <path d="M2.8 20a5.2 5.2 0 0 1 10.4 0M13.5 15.5A4.7 4.7 0 0 1 21 19.3"></path>
            </svg>
        `
    };

    document.querySelectorAll("#grid-hub-modulos > div").forEach(function(card) {
        const onclickAtual = card.getAttribute("onclick") || "";
        const resultado = onclickAtual.match(/ativarAba\('([^']+)'\)/);

        if (!resultado) {
            return;
        }

        const destino = resultado[1];
        const spanIcone = card.querySelector("span:first-child");

        if (!spanIcone || !iconesModulos[destino]) {
            return;
        }

        spanIcone.classList.add("aura-module-icon");
        spanIcone.innerHTML = iconesModulos[destino];
        spanIcone.setAttribute("aria-hidden", "true");
    });
})();
