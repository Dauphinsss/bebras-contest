/** Formato de presentación; conserva tildes, ñ, guiones y apóstrofos. */
export function formatPersonName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es")
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_match, separator, letter) => separator + letter.toLocaleUpperCase("es"),
    );
}
