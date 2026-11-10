/** Millionths of a currency unit, as the guest budget is stored, in whole units. */
export const fromMicros = (micros: number): number => micros / 1_000_000;

/**
 * An amount with the viewer's own number format and the currency's symbol. No currency means the price is unknown,
 * which is shown as such and never as free; a code Intl does not know (the "MIXED" a total of several currencies
 * reports) falls back to the plain number and the code.
 */
export function formatMoney(amount: number, currency?: string, maxFractionDigits = 4): string {
  if (!currency) return 'Unknown';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: maxFractionDigits
    }).format(amount);
  } catch {
    return `${amount.toFixed(maxFractionDigits)} ${currency}`;
  }
}
