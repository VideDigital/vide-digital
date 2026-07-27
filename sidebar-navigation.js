VIDE HUB — SIDEBAR LEITURA PREMIUM V4.0

Objetivo:
- deixar a sidebar mais profissional;
- melhorar leitura e respiração visual;
- aumentar espaçamento entre blocos;
- deixar os itens menos apertados;
- melhorar o card “Status da loja” e os botões inferiores;
- manter a estrutura atual sem quebrar IDs, Firebase ou permissões.

==================================================
1) ARQUIVO: foundation.css
AÇÃO: cole ESTE BLOCO NO FINAL do arquivo.
==================================================

/* =========================================================
   VIDE HUB — SIDEBAR LEITURA PREMIUM V4.0
   Cole no FINAL de foundation.css
   ========================================================= */

:root{
  --vide-sidebar-width-readable: 364px;
  --vide-sidebar-gap: 18px;
  --vide-sidebar-gap-lg: 22px;
}

/* Largura e respiro geral */
#admin-sidebar{
  width: var(--vide-sidebar-width-readable) !important;
  min-width: var(--vide-sidebar-width-readable) !important;
}

.glass-sidebar{
  padding: 18px 16px 16px !important;
  border-radius: 30px !important;
}

#admin-sidebar > div:first-child{
  gap: var(--vide-sidebar-gap-lg) !important;
}

/* Card de marca no topo */
#admin-sidebar .relative.overflow-hidden.rounded-3xl{
  border-radius: 28px !important;
}

#admin-sidebar .relative.overflow-hidden.rounded-3xl .relative.flex.items-center.justify-between,
#admin-sidebar .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4{
  gap: 16px !important;
}

#admin-logo-box{
  width: 60px !important;
  height: 60px !important;
  min-width: 60px !important;
  border-radius: 18px !important;
}

/* Card de workspace */
#admin-sidebar .glass-card.rounded-2xl{
  padding: 18px !important;
  border-radius: 24px !important;
}

/* Área de navegação */
.aura-sidebar-navigation{
  padding: 0 6px 16px 4px !important;
}

.aura-sidebar-navigation-header{
  padding: 4px 10px 16px !important;
  margin-bottom: 2px;
}

.aura-sidebar-navigation-badge{
  min-width: 40px;
  height: 24px;
  padding: 0 10px;
  font-size: 9px;
}

/* Busca */
.aura-sidebar-search{
  min-height: 48px !important;
  margin: 0 4px 20px !important;
  border-radius: 16px !important;
}

.aura-sidebar-search > svg{
  left: 14px !important;
  width: 16px !important;
  height: 16px !important;
}

.aura-sidebar-search-editor{
  min-height: 46px !important;
  padding: 0 56px 0 42px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.aura-sidebar-search kbd{
  right: 10px !important;
  min-width: 34px !important;
  height: 26px !important;
  font-size: 9px !important;
}

/* Grupos */
.aura-sidebar-navigation-groups{
  gap: 14px !important;
}

.aura-sidebar-group-header{
  min-height: 48px !important;
  padding: 8px 10px !important;
  border-radius: 14px !important;
}

.aura-sidebar-group-title{
  gap: 12px !important;
}

.aura-sidebar-group-icon{
  width: 32px !important;
  height: 32px !important;
  border-radius: 10px !important;
}

.aura-sidebar-group-icon svg{
  width: 15px !important;
  height: 15px !important;
}

.aura-sidebar-group-title strong{
  font-size: 10px !important;
  line-height: 1.15 !important;
  letter-spacing: .11em !important;
}

.aura-sidebar-group-title small{
  margin-top: 3px !important;
  font-size: 9px !important;
  line-height: 1.25 !important;
}

.aura-sidebar-group-content{
  padding: 6px 0 4px !important;
}

/* Itens do menu */
.aura-sidebar-group-content > button,
.nav-item{
  min-height: 50px !important;
  margin-top: 6px !important;
  padding: 12px 14px !important;
  border-radius: 14px !important;
  gap: 12px !important;
}

.aura-sidebar-group-content > button:first-child{
  margin-top: 0 !important;
}

.aura-sidebar-group-content > button svg,
.nav-item svg{
  width: 18px !important;
  height: 18px !important;
  flex-shrink: 0;
}

.vide-dock-label,
.aura-sidebar-group-content > button .vide-dock-label,
.nav-item .vide-dock-label{
  display: flex !important;
  flex-direction: column !important;
  min-width: 0;
}

.vide-dock-label strong{
  color: #F3F4F6 !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
  font-weight: 700 !important;
  letter-spacing: -.01em !important;
}

.vide-dock-description,
.vide-dock-label small{
  display: block !important;
  margin-top: 4px !important;
  color: #9CA3AF !important;
  font-size: 11px !important;
  line-height: 1.35 !important;
  font-weight: 500 !important;
}

.nav-item.active{
  box-shadow: 0 6px 20px -10px rgba(255,122,69,.35) !important;
}

.nav-item.active::before{
  left: -7px !important;
  width: 3px !important;
  top: 16% !important;
  bottom: 16% !important;
}

/* Card Status da loja */
#box-atalho{
  padding-top: 4px !important;
}

.aura-store-status-card{
  padding: 18px !important;
  border-radius: 24px !important;
}

.aura-store-status-header{
  margin-bottom: 14px !important;
}

.aura-store-status-eyebrow{
  font-size: 10px !important;
  letter-spacing: .08em !important;
}

.aura-store-status-title{
  margin-top: 4px !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
}

.aura-store-status-badge{
  min-height: 28px !important;
  padding: 0 10px !important;
  font-size: 10px !important;
}

.aura-store-status-link{
  min-height: 68px !important;
  padding: 12px 14px !important;
  border-radius: 16px !important;
  gap: 12px !important;
}

.aura-store-status-link-icon{
  width: 38px !important;
  height: 38px !important;
  min-width: 38px !important;
  border-radius: 12px !important;
}

.aura-store-status-address small{
  font-size: 10px !important;
  line-height: 1.2 !important;
}

.aura-store-status-address strong{
  margin-top: 4px !important;
  font-size: 13px !important;
  line-height: 1.3 !important;
  word-break: break-word;
}

.aura-store-status-share{
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 10px !important;
  margin-top: 14px !important;
}

.aura-store-status-copy{
  min-height: 42px !important;
  padding: 0 12px !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  gap: 8px !important;
}

.aura-store-status-copy svg{
  width: 16px !important;
  height: 16px !important;
}

/* CTA plano */
.aura-store-status-card .mt-4,
.aura-store-status-card .mt-3,
.aura-store-status-card .mt-5{
  margin-top: 14px !important;
}

.aura-store-status-card button:last-child,
.aura-store-status-card a:last-child{
  min-height: 40px !important;
  border-radius: 14px !important;
}

/* Rodapé da sidebar */
#box-logout{
  padding-top: 10px !important;
  margin-top: 4px !important;
  border-top: 1px solid rgba(255,255,255,.06);
}

.aura-sidebar-account-actions{
  display: flex;
  flex-direction: column;
  gap: 12px !important;
}

.aura-sidebar-account-button{
  min-height: 62px !important;
  padding: 12px 14px !important;
  border-radius: 16px !important;
  gap: 12px !important;
}

.aura-sidebar-account-icon{
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  border-radius: 12px !important;
}

.aura-sidebar-account-icon svg{
  width: 17px !important;
  height: 17px !important;
}

.aura-sidebar-account-text strong{
  font-size: 14px !important;
  line-height: 1.2 !important;
}

.aura-sidebar-account-text small{
  margin-top: 3px !important;
  font-size: 11px !important;
  line-height: 1.3 !important;
  color: #9CA3AF !important;
}

/* Scrollbar um pouco mais visível */
.aura-sidebar-navigation::-webkit-scrollbar{
  width: 6px !important;
}

.aura-sidebar-navigation::-webkit-scrollbar-thumb{
  background: rgba(255,255,255,.18) !important;
}

/* Ajuste para telas menores */
@media (max-width: 1279px){
  #admin-sidebar{
    width: 336px !important;
    min-width: 336px !important;
  }
}

@media (max-width: 1023px){
  #admin-sidebar{
    width: 100% !important;
    min-width: 100% !important;
  }

  .glass-sidebar{
    padding: 16px 14px !important;
  }

  .aura-store-status-share{
    grid-template-columns: 1fr !important;
  }
}

==================================================
2) OPCIONAL RECOMENDADO — DESCRIÇÃO NOS ITENS DO MENU
ARQUIVO: sidebar-navigation.js
AÇÃO: se os itens do menu NÃO mostrarem subtítulo, faça esta troca.
==================================================

ENCONTRE:
rotulo.appendChild(titulo);
rotulo.appendChild(detalhe);

SUBSTITUA POR:
rotulo.className = "vide-dock-label";
rotulo.appendChild(titulo);
rotulo.appendChild(detalhe);

==================================================
3) RESULTADO ESPERADO
==================================================

- sidebar com mais “respiro”;
- blocos mais separados;
- textos mais legíveis;
- menu menos apertado;
- status da loja mais organizado;
- Painel Master e Sair da conta com melhor leitura;
- aparência mais SaaS premium e menos “amontoada”.

==================================================
4) DEPOIS DE COLAR
==================================================

1. Salve o arquivo.
2. Faça Ctrl + F5.
3. Se ainda aparecer o visual antigo, teste em aba anônima.
