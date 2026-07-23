// Máscaras padrão (CNPJ, CPF, telefone) usadas em toda a digitação e exibição
// de campos de documento/telefone no sistema.

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

export function maskCPF(v: string): string {
  return onlyDigits(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskCNPJ(v: string): string {
  return onlyDigits(v)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

// CNPJ/CPF: detecta pelo total de dígitos já digitados (>11 vira CNPJ).
export function maskDocument(v: string): string {
  return onlyDigits(v).length > 11 ? maskCNPJ(v) : maskCPF(v);
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}
