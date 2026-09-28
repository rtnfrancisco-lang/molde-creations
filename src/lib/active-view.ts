/* Vista ativa do editor MoldeCore.
   O desenho técnico do canvas usa esta referência para saber qual peça está na tela:
   a vista "costas" recebe o buffer especial de 4 cm abaixo da barra. */
export const activeView: { current: string } = { current: "frente" };
