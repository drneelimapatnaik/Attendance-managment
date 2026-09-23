/**
 * Amount in words for fee receipts, using Indian numbering
 * (thousand → lakh → crore): 125000 → "Rupees One Lakh Twenty Five Thousand Only".
 *
 * Only INR is spelled out; other currencies return null so the receipt falls
 * back to figures (their wording conventions differ per locale).
 */
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ');
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ');
}

/** Whole number → words in the Indian system. Crores recurse, so 150,00,00,000 → "One Hundred Fifty Crore". */
export function integerToIndianWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  n %= 1000;
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

/** "Rupees Two Thousand Five Hundred and Fifty Paise Only", or null when the currency isn't INR. */
export function amountInWords(amount: number, currencyCode: string): string | null {
  if (currencyCode !== 'INR' || !Number.isFinite(amount) || amount < 0) return null;
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const paiseText = paise ? ` and ${belowHundred(paise)} Paise` : '';
  return `Rupees ${integerToIndianWords(rupees)}${paiseText} Only`;
}
