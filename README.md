# Ritmo Habit Planner

App web responsivo para habitos, tarefas, planejamento, revisao e diario pessoal.

## Recursos

- Habitos ilimitados com meta base, area, cor e historico.
- Planejamento diario com tarefas, prioridade, energia, horario, projeto e vinculo com habitos.
- Frequencia de habitos calculada pelas tarefas vinculadas que o usuario conclui no dia.
- Painel de hoje com progresso, sequencia, agenda e intencao do dia.
- Revisao com metricas, grafico semanal e leitura rapida.
- Diario por data com humor, intencao, vitoria e notas.
- Integracao com GitHub para preencher automaticamente o habito `GitHub Activity`.
- IA integrada com OpenAI para sugerir prioridades e planos com base nos dados do dia.
- Sistema local de contas com dados separados por usuario.
- Instalacao como app via PWA pelo botao `Baixar app`.
- Logo e favicon usando `public/icone.jpeg`.
- Backup aberto em JSON com importacao e exportacao.
- Sem premium e sem limite artificial.

## GitHub

Informe seu usuario e clique em sincronizar.

Sem token, o app usa eventos publicos recentes. Com um token pessoal do GitHub, ele busca o calendario anual de contribuicoes pela GraphQL API. O token fica salvo apenas no navegador e nao entra no backup JSON.

## Contas e app instalavel

O app tem cadastro/login local: cada conta salva seus proprios habitos, tarefas, diario e configuracoes no navegador. O menu lateral tambem tem o botao `Baixar app`, que aciona a instalacao PWA quando o navegador permite.

## Rodar localmente

```bash
npm install
npm run dev
```
