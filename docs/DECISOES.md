# Decisões aprovadas

Registro das decisões tomadas com o dono do produto. Não mudar sem nova aprovação (Parte 34, regra 18).

| Data | Decisão |
|---|---|
| 2026-11-02 | **Ambiente:** o código é escrito no Claude Code. Build, testes e publicação rodam no GitHub Actions + GitHub Pages (grátis). O Lovable pode publicar depois, a partir do mesmo repositório. |
| 2026-11-02 | **Repositório público** (exigência do GitHub Pages no plano gratuito). Nenhum dado pessoal entra no código: os dados ficam só no aparelho. |
| 2026-11-02 | **Idioma:** português (pt-BR) principal, inglês secundário, estrutura pronta para outros idiomas. |
| 2026-11-02 | **Logo:** o PNG enviado é a referência oficial (`public/brand/routig-logo-original.png`). O gradiente da imagem (violeta → roxo → rosa, sem ciano) prevalece sobre a descrição da Parte 3.2. A versão vetorial só substitui o PNG depois de aprovada na tela de comparação (Settings → Sobre → Logo). |
| 2026-11-02 | **Recuperação:** nota final = maior(nota original, mínimo(nota da recuperação; 6,0)). Configurável por ano letivo e disciplina, com histórico do cálculo. |
| 2026-11-02 | **Bônus:** valor de 0 a 0,5 informado pelo usuário, só quando a média é maior que 6,0. Nota final = mínimo(10,0; nota + bônus). Configurável. |
| 2026-11-02 | **Notificações:** lembretes locais com o app aberto. Web Push (app fechado) só no futuro, com autorização, porque exige servidor. |
| 2026-11-02 | **Backup:** automático dentro do app + exportação manual para Arquivos (o Safari não permite gravar sozinho numa pasta). |
| 2026-11-02 | **Finanças:** criptografia com chave derivada de PIN; valores ocultos no Dashboard e na busca por padrão. |
| 2026-11-02 | **Logo vetorial aprovado** pelo dono do produto, depois da comparação com o PNG (97,9% de sobreposição). Vale em todos os aparelhos (`VECTOR_APPROVED_AT` em `src/brand/mark.ts`). O ícone do PWA continua sendo o PNG original. |
| 2026-11-02 | **Sem Node local:** o computador de desenvolvimento não tem Node.js. Toda verificação de tipos, testes e build acontece no GitHub Actions. |
