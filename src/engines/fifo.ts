// ============================================================
// CONN3CT PNL — FIFO Cost Basis Engine
//
// FIFO (First In, First Out) is the standard cost-basis method
// for NFT trading. When you sell an NFT, the cost basis used
// is from the earliest acquisition batch.
//
// Formula:
//   Total Cost  = Purchase Price + Buy Gas Fee
//   Net Proceeds = Sale Price - Sell Gas - Marketplace Fee - Royalty
//   Realized P&L = Net Proceeds - Total Cost
//   ROI %        = (Realized P&L / Total Cost) * 100
// ============================================================

import {
  addEth,
  subtractEth,
  calcRoiPct,
  calcNetProceeds,
  calcRealizedPnl,
  calcTotalCost,
  calcUnrealizedPnl,
  ethToUsd,
} from '../utils/math';
import type { FifoBatch, FifoResult, RealizedPnlCalculation, UnrealizedPnlCalculation } from '../types';

// ── Build a FIFO batch from a buy transaction ─────────────────
export function buildFifoBatch(
  priceEth: string,
  gasFeeEth: string,
  quantity: number,
  acquisitionDate: Date,
  txHash: string,
): FifoBatch {
  const costBasisEth = (parseFloat(priceEth) / quantity).toFixed(18);
  const gasFeePerUnit = (parseFloat(gasFeeEth) / quantity).toFixed(18);
  const totalCostEth = calcTotalCost(costBasisEth, gasFeePerUnit);

  return {
    quantity,
    costBasisEth,
    gasFeeEth: gasFeePerUnit,
    totalCostEth,
    acquisitionDate,
    txHash,
  };
}

// ── Consume FIFO batches for a sale ──────────────────────────
// Returns the weighted-average cost from consumed batches plus
// the remaining unconsumed batches after the sale.
export function consumeFifoBatches(
  batches: FifoBatch[],
  quantityToSell: number,
): FifoResult & { consumed: FifoBatch[] } {
  if (batches.length === 0) {
    throw new Error('No FIFO batches available to consume');
  }

  const sorted = [...batches].sort(
    (a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime(),
  );

  let remaining = quantityToSell;
  const consumed: FifoBatch[] = [];
  const leftover: FifoBatch[] = [];
  let totalCostEth = '0';
  let totalGasFeeEth = '0';
  let totalCostBasisEth = '0';
  let earliestDate = sorted[0]!.acquisitionDate;

  for (const batch of sorted) {
    if (remaining <= 0) {
      leftover.push(batch);
      continue;
    }

    if (batch.quantity <= remaining) {
      // Consume entire batch
      remaining -= batch.quantity;
      consumed.push(batch);
      totalCostBasisEth = addEth(totalCostBasisEth, multiplyBatch(batch.costBasisEth, batch.quantity));
      totalGasFeeEth = addEth(totalGasFeeEth, multiplyBatch(batch.gasFeeEth, batch.quantity));
      totalCostEth = addEth(totalCostEth, multiplyBatch(batch.totalCostEth, batch.quantity));
    } else {
      // Partially consume this batch
      const partial: FifoBatch = {
        quantity: remaining,
        costBasisEth: batch.costBasisEth,
        gasFeeEth: batch.gasFeeEth,
        totalCostEth: batch.totalCostEth,
        acquisitionDate: batch.acquisitionDate,
        txHash: batch.txHash,
      };
      consumed.push(partial);
      totalCostBasisEth = addEth(totalCostBasisEth, multiplyBatch(batch.costBasisEth, remaining));
      totalGasFeeEth = addEth(totalGasFeeEth, multiplyBatch(batch.gasFeeEth, remaining));
      totalCostEth = addEth(totalCostEth, multiplyBatch(batch.totalCostEth, remaining));

      // Leave the rest of the batch
      leftover.push({
        ...batch,
        quantity: batch.quantity - remaining,
      });
      remaining = 0;
    }
  }

  if (remaining > 0) {
    throw new Error(`Cannot consume ${quantityToSell} units — only ${quantityToSell - remaining} available in FIFO queue`);
  }

  return {
    costBasisEth: totalCostBasisEth,
    gasFeeEth: totalGasFeeEth,
    totalCostEth,
    acquisitionDate: earliestDate,
    remainingBatches: leftover,
    consumed,
  };
}

function multiplyBatch(ethValue: string, quantity: number): string {
  return (parseFloat(ethValue) * quantity).toFixed(18);
}

// ── Calculate realized P&L from a completed sale ──────────────
export function calculateRealizedPnl(params: {
  costBasisEth: string;
  buyGasFeeEth: string;
  salePriceEth: string;
  sellGasFeeEth: string;
  marketplaceFeeEth: string;
  royaltyFeeEth: string;
  ethPriceUsd: number;
}): RealizedPnlCalculation {
  const {
    costBasisEth,
    buyGasFeeEth,
    salePriceEth,
    sellGasFeeEth,
    marketplaceFeeEth,
    royaltyFeeEth,
    ethPriceUsd,
  } = params;

  const totalCostEth = calcTotalCost(costBasisEth, buyGasFeeEth);
  const netProceedsEth = calcNetProceeds(salePriceEth, sellGasFeeEth, marketplaceFeeEth, royaltyFeeEth);
  const realizedPnlEth = calcRealizedPnl(netProceedsEth, totalCostEth);
  const realizedPnlUsd = ethToUsd(realizedPnlEth, ethPriceUsd);
  const roiPct = calcRoiPct(realizedPnlEth, totalCostEth);

  return {
    costBasisEth,
    buyGasFeeEth,
    totalCostEth,
    salePriceEth,
    sellGasFeeEth,
    marketplaceFeeEth,
    royaltyFeeEth,
    netProceedsEth,
    realizedPnlEth,
    realizedPnlUsd,
    roiPct,
  };
}

// ── Calculate unrealized P&L for a current holding ───────────
export function calculateUnrealizedPnl(params: {
  costBasisEth: string;
  gasFeeEth: string;
  currentFloorPriceEth: string;
  ethPriceUsd: number;
}): UnrealizedPnlCalculation {
  const { costBasisEth, gasFeeEth, currentFloorPriceEth, ethPriceUsd } = params;

  const totalCostEth = calcTotalCost(costBasisEth, gasFeeEth);
  const unrealizedPnlEth = calcUnrealizedPnl(currentFloorPriceEth, totalCostEth);
  const unrealizedPnlUsd = ethToUsd(unrealizedPnlEth, ethPriceUsd);
  const roiPct = calcRoiPct(unrealizedPnlEth, totalCostEth);

  return {
    costBasisEth,
    gasFeeEth,
    totalCostEth,
    currentFloorPriceEth,
    unrealizedPnlEth,
    unrealizedPnlUsd,
    roiPct,
  };
}

// ── Determine transaction direction ───────────────────────────
export function classifyTransaction(
  walletAddress: string,
  fromAddress: string | null,
  toAddress: string | null,
  isSale: boolean,
): 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'MINT' {
  const wallet = walletAddress.toLowerCase();
  const from = fromAddress?.toLowerCase();
  const to = toAddress?.toLowerCase();

  const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

  if (from === NULL_ADDRESS && to === wallet) return 'MINT';
  if (isSale && to === wallet) return 'BUY';
  if (isSale && from === wallet) return 'SELL';
  if (to === wallet) return 'TRANSFER_IN';
  if (from === wallet) return 'TRANSFER_OUT';
  return 'TRANSFER_IN';
}

// ── Parse OpenSea payment amount to ETH ──────────────────────
export function parsePaymentAmountToEth(quantity: string, decimals: number): string {
  const raw = BigInt(quantity);
  const divisor = BigInt(10 ** decimals);
  const eth = Number(raw) / Number(divisor);
  return eth.toFixed(18);
}
