# Etapa 6: o que testar no iPad e no iPhone

Estes testes só dá para fazer com o aparelho na mão. O resto da Etapa 6 (todas as telas no tamanho do iPad e do iPhone, fluxos principais, backup e recuperação, preparação para offline e acessibilidade) já foi testado no navegador em 2026-11-05 (versão 0.38.2).

Para cada item: marque ✅ se funcionou ou anote o que aconteceu (com print, se der).

## 1. Instalar e abrir sem internet (iPad e iPhone)
1. Abra https://lucasyung2012-dev.github.io/ROUTIG/ no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início**. Abra pelo ícone novo.
3. Use um pouco, feche o app, ligue o **modo avião** e abra de novo.
   - Esperado: abre normalmente, com os seus dados; dá para criar uma tarefa.
4. Desligue o modo avião.

## 2. Apple Pencil (iPad)
1. Notes → nova nota → Desenho. Desenhe, apague, desfaça, troque cor e espessura.
2. Ligue "Só a caneta desenha" e tente riscar com o dedo.
   - Esperado: o dedo não risca; a caneta sim, com traço mais grosso quando aperta mais.

## 3. Avisos do aparelho (com o app instalado na Tela de Início, iOS 16.4 ou mais novo)
1. Settings → Notificações → **Permitir avisos do aparelho** → aceite.
2. **Enviar aviso de teste**.
   - Esperado: aparece um aviso do ROUTIG na tela.
3. Crie uma tarefa para hoje com horário daqui a 20 minutos e deixe o app aberto em segundo plano.
   - Esperado: aviso 15 min antes. (Com o app totalmente fechado, o aviso não chega; ele espera no sino. Isso é limitação de app sem servidor.)

## 4. Sons e tela acesa do Focus
1. Focus → escolha um som (chuva, ondas, ruído) → Começar.
   - Esperado: ouve o som; a tela não apaga sozinha durante a sessão.
2. Ponha 1 minuto de foco nas configurações e espere acabar.
   - Esperado: toca o sinal de fim.

## 5. Microfone
1. Inbox → gravar áudio → fale algo → pare → ouça.
2. Idiomas → um idioma → Pronúncia → gravar a própria voz → ouça.
   - Esperado: o Safari pede permissão do microfone uma vez; a gravação toca.

## 6. Arquivos
1. Inbox → anexar uma foto ou um PDF. Depois → **Guardar na Library**.
2. Library → **Importar** um PDF do app Arquivos.
3. Música → uma música → anexar partitura (PDF ou imagem).
4. Finanças → Importar → um **CSV de verdade da corretora**.
   - Esperado: prévia antes de importar; nada é criado sem confirmar.

## 7. Backup no app Arquivos
1. Settings → Backup → **Exportar backup** → salve em Arquivos.
2. Settings → Backup → **Abrir um arquivo de backup** → escolha o arquivo salvo.
   - Esperado: "Arquivo íntegro" e "nada para recuperar".
3. Settings → Importar e exportar → exporte **Tarefas (.csv)** e **Calendar (.ics)** e abra no Numbers e no Calendário.

## 8. PIN do app
1. Settings → Segurança → Definir PIN → "Pedir o PIN de novo depois de: Sempre que sair do app".
2. Vá para a Tela de Início e volte para o ROUTIG.
   - Esperado: pede o PIN.
3. Se quiser, remova o PIN no fim.

## 9. Toque e tela
1. Tasks → visualização **Quadro** → arraste um cartão com o dedo para outra coluna.
2. Gire o iPad (retrato e paisagem) em algumas telas.
3. Habits → visão **Ano**: os quadradinhos são pequenos no iPhone (tocar só abre a janela de registro do dia). Diga se incomoda.

## 10. Dados de teste
O navegador de testes tem registros criados nos testes (por exemplo "E6 tarefa de teste", "E6 evento de teste", "E6 nota de teste" e o link example.com/teste-routig na Library). Antes da sincronização pelo Google Drive, eles serão apagados — só com a confirmação do dono do produto.
