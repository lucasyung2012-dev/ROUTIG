# Google Cloud: criar o ID do cliente (para login e sincronização)

**Atualizado: 2026-11-07.** Feito uma vez, pelo dono do app, na conta Google dele (decisão D11). Leva uns 10 minutos.

O ROUTIG usa só a **pasta oculta do próprio app** no Google Drive (escopo `drive.appdata`): não enxerga nenhum outro arquivo do Drive. Os dados vão criptografados; o Google não tem a chave.

## Passo a passo

1. Abra https://console.cloud.google.com/ e entre com a sua conta Google.
2. No topo, **Selecionar projeto → Novo projeto**. Nome: `ROUTIG`. Criar.
3. Menu **APIs e serviços → Biblioteca**. Procure **Google Drive API** e clique em **Ativar**.
4. Menu **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform → Branding"):
   - Tipo de usuário: **Externo**.
   - Nome do app: `ROUTIG`; e-mail de suporte: o seu.
   - Em **Público-alvo / Usuários de teste**, adicione o seu e-mail (e de quem mais for usar).
   - Em **Escopos / Acesso a dados**, adicione: `.../auth/drive.appdata`, `openid`, `email`, `profile`.
5. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - Nome: `ROUTIG web`.
   - **Origens JavaScript autorizadas**: `https://lucasyung2012-dev.github.io`
     (se for testar no computador com o servidor local, adicione também `http://localhost:5173`).
   - Não precisa de URI de redirecionamento.
   - Criar. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
6. No ROUTIG: **Configurações → Conta e sincronização → 1. ID do cliente do Google**: cole e salve.
   (O ID do cliente não é senha: pode ficar visível. A chave secreta do cliente não é usada.)

## Ligar os aparelhos

1. No **primeiro aparelho**: Entrar com o Google → **Criar a chave** → guarde o **código de recuperação** (papel ou gerenciador de senhas). Depois, **Sincronizar agora**.
2. Em **cada outro aparelho**: cole o mesmo ID do cliente → Entrar com o Google (mesma conta) → digite o código de recuperação → **Ligar este aparelho** → **Sincronizar agora**.
3. A partir daí, "Sincronizar sozinho" junta os dados ao abrir o app, a cada 5 minutos e ao sair dele.

## Enquanto o app estiver "Em teste" no Google

- Só os e-mails listados em **Usuários de teste** conseguem entrar.
- O Google pode pedir para entrar de novo de tempos em tempos; é normal no modo de teste.

## O que ainda não sincroniza

- Arquivos guardados na Library (PDFs, imagens): ficam no aparelho onde foram adicionados.
- Travas de PIN (são de cada aparelho).
- Registros apagados de vez sem passar pela lixeira.
