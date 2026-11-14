# Dropbox: criar a chave do app (sincronização entre aparelhos)

**Atualizado: 2026-11-13.** Feito uma vez, pelo dono do app, na conta Dropbox dele. Leva uns 5 minutos.
Entrar no Dropbox com "Continuar com o Google" funciona normalmente.

O Dropbox é o provedor principal da sincronização: você entra uma vez em cada aparelho e ela continua
sozinha, também no iPhone e no iPad. O Google Drive fica como alternativa (docs/GOOGLE-CLOUD.md).

O ROUTIG usa só a pasta **Aplicativos/ROUTIG…** do seu Dropbox (acesso "App folder"): não enxerga
nenhum outro arquivo. Os dados vão criptografados; o Dropbox não tem a chave.

## Passo a passo

1. Abra https://www.dropbox.com/developers/apps e entre na sua conta.
2. **Create app**:
   - **Choose an API:** Scoped access.
   - **Choose the type of access:** **App folder**.
   - **Name your app:** um nome único no Dropbox inteiro, por exemplo `ROUTIG-sync-` seguido de umas letras.
   - **Create app**.
3. Aba **Permissions**: marque `files.metadata.read`, `files.content.read` e `files.content.write`
   (`account_info.read` já vem marcado). Clique em **Submit** no fim da página.
   Faça isto **antes** de entrar pelo ROUTIG; mudar depois exige entrar de novo em cada aparelho.
4. Aba **Settings**:
   - **OAuth 2 → Redirect URIs:** adicione `https://lucasyung2012-dev.github.io/ROUTIG/` e clique em **Add**
     (o ROUTIG mostra esse endereço em Configurações, Conta e sincronização, passo 1).
     Para testar com o servidor local, adicione também `http://localhost:5173/`.
   - **Allow public clients (Implicit Grant & PKCE):** deixe em **Allow**.
   - Copie o **App key** (letras e números). O **App secret** não é usado: não copie nem cole em lugar nenhum.
5. No ROUTIG: **Configurações → Conta e sincronização → Onde guardar: Dropbox → 1. Chave do app no Dropbox**: cole e salve.

O app fica em "Development" no Dropbox; isso basta para uso próprio (até 500 contas). Não precisa pedir "Production".

## Ligar os aparelhos

1. No **primeiro aparelho**: Entrar com o Dropbox → permita o acesso → o ROUTIG volta sozinho →
   **Criar a chave** → guarde o **código de recuperação** (papel ou gerenciador de senhas) → **Sincronizar agora**.
2. Em **cada outro aparelho** (pelo app instalado na tela inicial): cole a mesma chave do app →
   Entrar com o Dropbox (mesma conta) → digite o código de recuperação → **Ligar este aparelho** → **Sincronizar agora**.
3. A partir daí, "Sincronizar sozinho" junta os dados ao abrir o app, a cada 5 minutos e ao sair dele, sem pedir login de novo.

**Se o login não voltar sozinho para o app** (pode acontecer no app instalado no iPhone/iPad):
use **Entrar com código**. O Dropbox abre em outra janela e mostra um código; copie, volte ao ROUTIG,
cole no campo e toque em **Confirmar**.

## Desligar

- **Desligar neste aparelho** (no ROUTIG) apaga o acesso deste aparelho; os dados locais e os arquivos no Dropbox ficam.
- Para cortar o acesso de todos os aparelhos: no site do Dropbox, **Configurações → Aplicativos conectados** → remover o app.

## O que ainda não sincroniza

- Arquivos guardados na Library (PDFs, imagens): ficam no aparelho onde foram adicionados.
- Travas de PIN (são de cada aparelho).
- Registros apagados de vez sem passar pela lixeira.
