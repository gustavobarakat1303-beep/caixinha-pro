# Logica Validada Na Planilha De Marco 2026

Fonte analisada: `CAIXINHA MARCO 2026.xlsx`

Regras confirmadas na planilha:

1. A retencao de encargos usada no fechamento e de `33%`.
2. Depois da retencao, a divisao entre pools e:
   - `80%` para `SALAO`
   - `20%` para `COZINHA`
3. Os pontos do colaborador sao fixos por cargo.
   - Exemplo: se o cargo vale `7`, ele sempre participa com `7`.
   - Esse valor so muda se a configuracao do cargo for alterada.
4. A presenca nao soma pontos extras.
   - Ela apenas define se o colaborador participa ou nao da divisao naquele dia.
5. `SALAO` e `COZINHA` precisam ter valor do ponto calculado separadamente.
   - Um colaborador da cozinha com `7` pontos nao deve receber o mesmo que um colaborador do salao com `7` pontos, porque os pools sao diferentes.
6. A exibicao do app deve refletir a mesma separacao usada na planilha.
   - Valor do ponto do `SALAO`
   - Valor do ponto da `COZINHA`

Correcao aplicada no projeto:

- O calculo mensal agora filtra por unidade da competencia.
- A distribuicao usa os pontos fixos do cargo.
- A elegibilidade diaria depende de presenca `PRESENTE`.
- O rateio diario usa pools separados de `SALAO` e `COZINHA`.
- Dashboard e Lancamentos passaram a mostrar o valor do ponto por pool, sem misturar setores.
- Configuracoes novas passaram a nascer com os defaults validados na planilha:
  - taxa sugerida `12%`
  - retencao `33%`
  - cozinha `20%`
  - salao `80%`
