/**
 * Helpers centralizados de timezone para o sistema.
 * Tudo deve usar America/Sao_Paulo (GMT-03).
 */

export const TIMEZONE = 'America/Sao_Paulo';

/** Formata Date como "dd/mm/aaaa" em GMT-03 */
export function fmtDateBR(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: TIMEZONE });
}

/** Formata Date como "dd/mm/aaaa HH:mm" em GMT-03 */
export function fmtDateTimeBR(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Formata Date como "12 de maio de 2026" em GMT-03 */
export function fmtDateLongBR(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

/** Formata Date como ISO em GMT-03 para logs */
export function fmtISOBR(d?: Date): string {
  return (d || new Date()).toLocaleString('sv-SE', { timeZone: TIMEZONE }).replace(' ', 'T');
}

/** Formata moeda BRL */
export function fmtMoneyBR(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
