const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatUsdFromCents(valueInCents: number) {
  return currencyFormatter.format(valueInCents / 100);
}
