
export const normalizeToUppercase = (text: string | null | undefined): string => {
  if (!text) return '';
  // Converte para maiúsculas e remove espaços extras
  return text.trim().toUpperCase();
};

/**
 * Normaliza um objeto, convertendo campos específicos para letras maiúsculas.
 * @param data O objeto contendo os dados.
 * @param fieldsToNormalize Array de chaves do objeto que devem ser normalizadas.
 * @returns Um novo objeto com os campos normalizados.
 */
export const normalizeDataForFirestore = <T extends object>(data: T, fieldsToNormalize: (keyof T)[]): T => {
  const normalizedData = { ...data };
  
  fieldsToNormalize.forEach((field) => {
    const value = normalizedData[field];
    if (typeof value === 'string') {
      normalizedData[field] = normalizeToUppercase(value) as any;
    }
  });
  
  return normalizedData;
};
