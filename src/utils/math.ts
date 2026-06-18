// ── High-precision decimal arithmetic using BigInt ────────────
// All ETH values stored as strings in 18-decimal fixed-point notation.
// We use Prisma's Decimal for DB compatibility and plain string maths here.

const ETH_DECIMALS = 18n;
const WEI_PER_ETH = 10n ** ETH_DECIMALS;
const GWEI_PER_ETH = 10n ** 9n;

export function weiToEth(wei: bigint): string {
  const eth = Number(wei) / Number(WEI_PER_ETH);
  return eth.toFixed(18);
}

export function gweiToEth(gwei: bigint): string {
  const eth = Number(gwei) / Number(GWEI_PER_ETH);
  return eth.toFixed(9);
}

export function ethToWei(eth: string): bigint {
  const [whole, frac = ''] = eth.split('.');
  const fracPadded = frac.padEnd(18, '0').slice(0, 18);
  return BigInt(whole ?? '0') * WEI_PER_ETH + BigInt(fracPadded);
}

export function addEth(a: string, b: string): string {
  const sum = parseFloat(a) + parseFloat(b);
  return sum.toFixed(18);
}

export function subtractEth(a: string, b: string): string {
  const diff = parseFloat(a) - parseFloat(b);
  return diff.toFixed(18);
}

export function multiplyEth(eth: string, factor: number): string {
  const result = parseFloat(eth) * factor;
  return result.toFixed(18);
}

export function divideEth(eth: string, divisor: number): string {
  if (divisor === 0) return '0';
  return (parseFloat(eth) / divisor).toFixed(18);
}

export function calcRoiPct(pnl: string, costBasis: string): string {
  const cost = parseFloat(costBasis);
  if (cost === 0) return '0';
  return ((parseFloat(pnl) / cost) * 100).toFixed(4);
}

export function calcMarketplaceFee(salePrice: string, feeBps: number): string {
  return (parseFloat(salePrice) * (feeBps / 10000)).toFixed(18);
}

export function calcRoyaltyFee(salePrice: string, royaltyBps: number): string {
  return (parseFloat(salePrice) * (royaltyBps / 10000)).toFixed(18);
}

export function calcNetProceeds(
  salePrice: string,
  sellGas: string,
  marketplaceFee: string,
  royaltyFee: string,
): string {
  const net =
    parseFloat(salePrice) -
    parseFloat(sellGas) -
    parseFloat(marketplaceFee) -
    parseFloat(royaltyFee);
  return net.toFixed(18);
}

export function calcRealizedPnl(netProceeds: string, totalCost: string): string {
  return (parseFloat(netProceeds) - parseFloat(totalCost)).toFixed(18);
}

export function calcTotalCost(costBasis: string, gasFee: string): string {
  return (parseFloat(costBasis) + parseFloat(gasFee)).toFixed(18);
}

export function calcUnrealizedPnl(currentValue: string, totalCost: string): string {
  return (parseFloat(currentValue) - parseFloat(totalCost)).toFixed(18);
}

export function ethToUsd(eth: string, ethPriceUsd: number): string {
  return (parseFloat(eth) * ethPriceUsd).toFixed(2);
}

export function sumEthArray(values: string[]): string {
  return values.reduce((acc, v) => addEth(acc, v), '0').toString();
}

export function calcWinRate(winningTrades: number, totalTrades: number): string {
  if (totalTrades === 0) return '0';
  return ((winningTrades / totalTrades) * 100).toFixed(2);
}
