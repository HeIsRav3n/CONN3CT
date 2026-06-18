import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface CollectionPnlImageData {
  collectionName: string;
  collectionImageUrl?: string;
  contractAddress: string;
  walletLabel: string;
  spentEth: number;
  salesEth: number;
  holdingValueEth: number;
  gasFeeEth: number;
  mintCount: number;
  buyCount: number;
  sellCount: number;
  heldCount: number;
  realizedPnlEth: number;
  unrealizedPnlEth: number;
  totalPnlEth: number;
  totalPnlUsd: number;
  roiPct: number;
  ethPriceUsd: number;
}

const W = 900;
const H = 500;
const LEFT_W = 260;

function trunc(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fEth(n: number): string {
  return (n >= 0 ? '' : '') + Math.abs(n).toFixed(4);
}

function fUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}k`;
  return `$${Math.round(abs)}`;
}

function fRoi(pct: number): string {
  const sign = pct >= 0 ? '+' : '-';
  const abs = Math.abs(pct);
  if (abs >= 100_000) return `${sign}${Math.round(abs / 1000)}k%`;
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(1)}k%`;
  return `${sign}${Math.round(abs)}%`;
}

function drawRoundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generatePnlImage(data: CollectionPnlImageData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ────────────────────────────────────────────────
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(0,180,255,0.04)';
  for (let x = 20; x < W; x += 28) {
    for (let y = 20; y < H; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Left panel ────────────────────────────────────────────────
  const lg = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  lg.addColorStop(0, 'rgba(0,180,255,0.07)');
  lg.addColorStop(1, 'rgba(0,180,255,0.02)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, LEFT_W, H);

  ctx.strokeStyle = 'rgba(0,180,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_W, 0);
  ctx.lineTo(LEFT_W, H);
  ctx.stroke();

  // ── Top bar ───────────────────────────────────────────────────
  const topH = 44;
  ctx.fillStyle = 'rgba(0,180,255,0.06)';
  ctx.fillRect(0, 0, W, topH);
  ctx.strokeStyle = 'rgba(0,180,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, topH);
  ctx.lineTo(W, topH);
  ctx.stroke();

  // Logo mark
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('◈', 14, 27);
  ctx.font = 'bold 13px monospace';
  ctx.fillText('CONN3CT', 30, 27);
  ctx.fillStyle = 'rgba(0,212,255,0.5)';
  ctx.font = '11px monospace';
  ctx.fillText('PNL TERMINAL', 107, 27);

  // Wallet label top-right
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(data.walletLabel, W - 16, 27);
  ctx.textAlign = 'left';

  // ── Collection image ──────────────────────────────────────────
  const imgX = 16, imgY = 56, imgSize = 200;
  if (data.collectionImageUrl) {
    try {
      const img = await loadImage(data.collectionImageUrl);
      ctx.save();
      drawRoundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.clip();
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      ctx.restore();
      // Glow border
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(0,212,255,0.5)';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } catch {
      ctx.fillStyle = 'rgba(0,180,255,0.08)';
      drawRoundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,180,255,0.3)';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', imgX + imgSize / 2, imgY + imgSize / 2 + 16);
      ctx.textAlign = 'left';
    }
  } else {
    ctx.fillStyle = 'rgba(0,180,255,0.08)';
    drawRoundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
    ctx.fill();
  }

  // Collection name
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#00d4ff';
  ctx.textAlign = 'center';
  let name = data.collectionName.toUpperCase();
  while (ctx.measureText(name).width > LEFT_W - 20 && name.length > 1) name = name.slice(0, -1);
  if (name !== data.collectionName.toUpperCase()) name += '…';
  ctx.fillText(name, LEFT_W / 2, imgY + imgSize + 22);

  // Contract
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.4)';
  ctx.fillText(trunc(data.contractAddress), LEFT_W / 2, imgY + imgSize + 38);
  ctx.textAlign = 'left';

  // ── Stats grid (left panel) ───────────────────────────────────
  const statsY = imgY + imgSize + 58;
  const statItems = [
    { label: 'MINTS', val: data.mintCount },
    { label: 'BUYS', val: data.buyCount },
    { label: 'SELLS', val: data.sellCount },
    { label: 'HELD', val: data.heldCount },
  ];

  statItems.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = 16 + col * 120;
    const sy = statsY + row * 44;

    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.45)';
    ctx.fillText(s.label, sx, sy);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = s.val > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.fillText(String(s.val), sx, sy + 20);
  });

  // ── Right data rows ───────────────────────────────────────────
  const rx = LEFT_W + 20;
  const rowStartY = topH + 12;
  const rowH = (H - topH - 85) / 4;

  const rows = [
    { label: 'SPENT', eth: data.spentEth },
    { label: 'SALES', eth: data.salesEth },
    { label: 'HOLDING', eth: data.holdingValueEth },
    { label: 'GAS', eth: data.gasFeeEth },
  ];

  rows.forEach((row, i) => {
    const ry = rowStartY + i * rowH;

    // Divider
    if (i > 0) {
      ctx.strokeStyle = 'rgba(0,180,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 2);
      ctx.lineTo(W - 16, ry - 2);
      ctx.stroke();
    }

    // Accent bar
    const barGrad = ctx.createLinearGradient(LEFT_W + 2, 0, LEFT_W + 4, 0);
    barGrad.addColorStop(0, 'rgba(0,212,255,0.8)');
    barGrad.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(LEFT_W + 2, ry + 4, 3, rowH - 12);

    // Label
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.5)';
    ctx.fillText(row.label, rx, ry + 16);

    // ETH value
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`${fEth(row.eth)} Ξ`, rx, ry + 48);

    // USD value
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText(fUsd(row.eth * data.ethPriceUsd), W - 16, ry + 48);
    ctx.textAlign = 'left';
  });

  // ── Bottom P&L bar ────────────────────────────────────────────
  const btmH = 72;
  const btmY = H - btmH;
  const isProfit = data.totalPnlEth >= 0;
  const pnlColor = isProfit ? '#00ff88' : '#ff3355';
  const pnlBg = isProfit ? 'rgba(0,255,136,0.07)' : 'rgba(255,51,85,0.07)';
  const pnlBorder = isProfit ? 'rgba(0,255,136,0.35)' : 'rgba(255,51,85,0.35)';

  ctx.fillStyle = pnlBg;
  ctx.fillRect(LEFT_W + 1, btmY, W - LEFT_W - 1, btmH);
  ctx.strokeStyle = pnlBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_W + 1, btmY);
  ctx.lineTo(W, btmY);
  ctx.stroke();

  // P&L label
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.5)';
  ctx.fillText('TOTAL P&L', rx, btmY + 18);

  // Realized / Unrealized split
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `REALIZED ${data.realizedPnlEth >= 0 ? '+' : ''}${fEth(data.realizedPnlEth)} Ξ  |  UNREALIZED ${data.unrealizedPnlEth >= 0 ? '+' : ''}${fEth(data.unrealizedPnlEth)} Ξ`,
    W - 16,
    btmY + 18,
  );
  ctx.textAlign = 'left';

  // Big P&L number
  const sign = data.totalPnlEth >= 0 ? '+' : '-';
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = pnlColor;
  ctx.shadowColor = pnlColor;
  ctx.shadowBlur = 12;
  ctx.fillText(`${sign}${fEth(Math.abs(data.totalPnlEth))} Ξ`, rx, btmY + 56);
  ctx.shadowBlur = 0;

  // USD
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = pnlColor;
  ctx.fillText(`${sign}${fUsd(Math.abs(data.totalPnlUsd))}`, rx + 270, btmY + 56);

  // ROI
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = pnlColor;
  ctx.shadowColor = pnlColor;
  ctx.shadowBlur = 8;
  ctx.fillText(fRoi(data.roiPct), W - 16, btmY + 56);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ── Shared canvas helpers ─────────────────────────────────────
function drawBg(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, w: number, h: number): void {
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,180,255,0.04)';
  for (let x = 20; x < w; x += 28)
    for (let y = 20; y < h; y += 28) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
}

function drawTopBar(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  w: number, label: string, right: string,
): void {
  ctx.fillStyle = 'rgba(0,180,255,0.06)';
  ctx.fillRect(0, 0, w, 44);
  ctx.strokeStyle = 'rgba(0,180,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 44); ctx.lineTo(w, 44); ctx.stroke();
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#00d4ff';
  ctx.fillText('◈ CONN3CT', 14, 27);
  ctx.fillStyle = 'rgba(0,212,255,0.5)';
  ctx.font = '11px monospace';
  ctx.fillText(label, 100, 27);
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText(right, w - 16, 27);
  ctx.textAlign = 'left';
}

function drawBottomPnl(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  w: number, h: number, totalEth: number, totalUsd: number, roi: number,
): void {
  const btmH = 72;
  const btmY = h - btmH;
  const isProfit = totalEth >= 0;
  const col = isProfit ? '#00ff88' : '#ff3355';
  ctx.fillStyle = isProfit ? 'rgba(0,255,136,0.07)' : 'rgba(255,51,85,0.07)';
  ctx.fillRect(0, btmY, w, btmH);
  ctx.strokeStyle = isProfit ? 'rgba(0,255,136,0.35)' : 'rgba(255,51,85,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, btmY); ctx.lineTo(w, btmY); ctx.stroke();

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.5)';
  ctx.fillText('TOTAL P&L', 20, btmY + 18);

  const sign = totalEth >= 0 ? '+' : '-';
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.fillText(`${sign}${fEth(Math.abs(totalEth))} Ξ`, 20, btmY + 56);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = col;
  ctx.fillText(`${sign}${fUsd(Math.abs(totalUsd))}`, 310, btmY + 56);

  ctx.textAlign = 'right';
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.fillText(fRoi(roi), w - 16, btmY + 56);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

// ── PNL Overview Card ─────────────────────────────────────────
export interface PnlCardData {
  username: string;
  avatarUrl?: string;
  realizedPnlEth: number;
  unrealizedPnlEth: number;
  totalPnlEth: number;
  totalPnlUsd: number;
  costBasisEth: number;
  roiPct: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  bestTradeEth: number;
  worstTradeEth: number;
  avgHoldDays: number;
  ethPriceUsd: number;
}

export async function generatePnlCard(data: PnlCardData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBg(ctx, W, H);
  drawTopBar(ctx, W, 'PNL TERMINAL', `ETH: ${fUsd(data.ethPriceUsd)}`);

  const col = data.totalPnlEth >= 0 ? '#00ff88' : '#ff3355';
  const MID = W / 2;
  const TOP = 56;

  // ── Left column: P&L breakdown ────────────────────────────
  const leftItems = [
    { label: 'REALIZED P&L', eth: data.realizedPnlEth, signed: true },
    { label: 'UNREALIZED P&L', eth: data.unrealizedPnlEth, signed: true },
    { label: 'COST BASIS', eth: data.costBasisEth, signed: false },
  ];

  leftItems.forEach((item, i) => {
    const y = TOP + i * 108;
    const isPos = item.eth >= 0;
    const itemCol = item.signed ? (isPos ? '#00ff88' : '#ff3355') : '#e8f4ff';

    ctx.fillStyle = 'rgba(0,180,255,0.08)';
    ctx.fillRect(16, y, MID - 32, 92);
    ctx.strokeStyle = 'rgba(0,180,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, y, MID - 32, 92);

    // Accent top bar
    ctx.fillStyle = item.signed ? (isPos ? '#00ff88' : '#ff3355') : '#00d4ff';
    ctx.fillRect(16, y, MID - 32, 2);

    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.55)';
    ctx.fillText(item.label, 26, y + 18);

    const sign = item.signed ? (item.eth >= 0 ? '+' : '-') : '';
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = itemCol;
    if (item.signed) { ctx.shadowColor = itemCol; ctx.shadowBlur = 8; }
    ctx.fillText(`${sign}${fEth(Math.abs(item.eth))} Ξ`, 26, y + 52);
    ctx.shadowBlur = 0;

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.5)';
    ctx.fillText(`${sign}${fUsd(Math.abs(item.eth * data.ethPriceUsd))}`, 26, y + 74);
  });

  // ── Right column: Performance ─────────────────────────────
  const rx = MID + 16;
  const rw = W - rx - 16;

  // ROI box
  ctx.fillStyle = 'rgba(0,180,255,0.08)';
  ctx.fillRect(rx, TOP, rw, 88);
  ctx.strokeStyle = 'rgba(0,180,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, TOP, rw, 88);
  ctx.fillStyle = '#00d4ff';
  ctx.fillRect(rx, TOP, rw, 2);

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.fillText('OVERALL ROI', rx + 10, TOP + 18);

  ctx.font = 'bold 30px monospace';
  ctx.fillStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.fillText(fRoi(data.roiPct), rx + 10, TOP + 60);
  ctx.shadowBlur = 0;

  // Win rate box
  const wrY = TOP + 104;
  ctx.fillStyle = 'rgba(0,180,255,0.08)';
  ctx.fillRect(rx, wrY, rw, 92);
  ctx.strokeStyle = 'rgba(0,180,255,0.15)';
  ctx.strokeRect(rx, wrY, rw, 92);
  ctx.fillStyle = '#00d4ff';
  ctx.fillRect(rx, wrY, rw, 2);

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.fillText('WIN RATE', rx + 10, wrY + 18);

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = data.winRate >= 50 ? '#00ff88' : '#ff3355';
  ctx.fillText(`${data.winRate.toFixed(1)}%`, rx + 10, wrY + 48);

  // Progress bar
  const barX = rx + 10, barY = wrY + 60, barW = rw - 20, barH = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(barX, barY, barW, barH);
  const fill = (data.winRate / 100) * barW;
  const barGrad = ctx.createLinearGradient(barX, 0, barX + fill, 0);
  barGrad.addColorStop(0, '#00d4ff');
  barGrad.addColorStop(1, '#00ff88');
  ctx.fillStyle = barGrad;
  ctx.fillRect(barX, barY, fill, barH);

  // Trade stats
  const trY = TOP + 212;
  ctx.fillStyle = 'rgba(0,180,255,0.08)';
  ctx.fillRect(rx, trY, rw, 116);
  ctx.strokeStyle = 'rgba(0,180,255,0.15)';
  ctx.strokeRect(rx, trY, rw, 116);
  ctx.fillStyle = '#00d4ff';
  ctx.fillRect(rx, trY, rw, 2);

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.fillText('PERFORMANCE', rx + 10, trY + 18);

  const perfRows = [
    { label: 'TRADES', val: `${data.totalTrades}  (${data.wins}W / ${data.losses}L)` },
    { label: 'BEST', val: `+${fEth(data.bestTradeEth)} Ξ` },
    { label: 'WORST', val: `${data.worstTradeEth >= 0 ? '+' : ''}${fEth(data.worstTradeEth)} Ξ` },
    { label: 'AVG HOLD', val: `${data.avgHoldDays}d` },
  ];
  perfRows.forEach((r, i) => {
    const ry2 = trY + 36 + i * 20;
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.45)';
    ctx.fillText(r.label, rx + 10, ry2);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(r.val, rx + rw - 10, ry2);
    ctx.textAlign = 'left';
  });

  // Username
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.5)';
  ctx.textAlign = 'right';
  ctx.fillText(data.username.toUpperCase(), W - 16, H - 78);
  ctx.textAlign = 'left';

  drawBottomPnl(ctx, W, H, data.totalPnlEth, data.totalPnlUsd, data.roiPct);
  return canvas.toBuffer('image/png');
}

// ── Portfolio Overview Card ───────────────────────────────────
export interface PortfolioCardData {
  username: string;
  walletCount: number;
  totalHoldings: number;
  portfolioValueEth: number;
  portfolioValueUsd: number;
  costBasisEth: number;
  gasFeeEth: number;
  realizedPnlEth: number;
  unrealizedPnlEth: number;
  totalPnlEth: number;
  totalPnlUsd: number;
  roiPct: number;
  winRate: number;
  wins: number;
  losses: number;
  totalTrades: number;
  bestTradeEth: number;
  topCollections: { name: string; holdings: number; pnlEth: number }[];
  ethPriceUsd: number;
}

export async function generatePortfolioCard(data: PortfolioCardData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBg(ctx, W, H);
  drawTopBar(
    ctx, W, 'PORTFOLIO',
    `${data.totalHoldings} NFTs · ${data.walletCount} wallet${data.walletCount !== 1 ? 's' : ''}`,
  );

  const col = data.totalPnlEth >= 0 ? '#00ff88' : '#ff3355';
  const TOP = 56;
  const MID = W / 2;

  // ── Left: value + cost + gas ──────────────────────────────
  const leftBoxes = [
    { label: 'PORTFOLIO VALUE', eth: data.portfolioValueEth, usd: data.portfolioValueUsd, accent: '#00d4ff' },
    { label: 'COST BASIS',      eth: data.costBasisEth, usd: data.costBasisEth * data.ethPriceUsd, accent: '#00d4ff' },
    { label: 'GAS SPENT',       eth: data.gasFeeEth, usd: data.gasFeeEth * data.ethPriceUsd, accent: '#ff9d3d' },
  ];
  leftBoxes.forEach((b, i) => {
    const y = TOP + i * 108;
    ctx.fillStyle = 'rgba(0,180,255,0.08)';
    ctx.fillRect(16, y, MID - 32, 92);
    ctx.strokeStyle = 'rgba(0,180,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, y, MID - 32, 92);
    ctx.fillStyle = b.accent;
    ctx.fillRect(16, y, MID - 32, 2);

    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.55)';
    ctx.fillText(b.label, 26, y + 18);

    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`${fEth(b.eth)} Ξ`, 26, y + 52);

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.5)';
    ctx.fillText(fUsd(b.usd), 26, y + 74);
  });

  // ── Right: P&L split + collections ───────────────────────
  const rx = MID + 16;
  const rw = W - rx - 16;

  // Realized / Unrealized
  [[data.realizedPnlEth, 'REALIZED P&L'], [data.unrealizedPnlEth, 'UNREALIZED P&L']].forEach(([eth, label], i) => {
    const n = eth as number;
    const y2 = TOP + i * 108;
    const itemCol = n >= 0 ? '#00ff88' : '#ff3355';
    ctx.fillStyle = 'rgba(0,180,255,0.08)';
    ctx.fillRect(rx, y2, rw, 92);
    ctx.strokeStyle = 'rgba(0,180,255,0.15)';
    ctx.strokeRect(rx, y2, rw, 92);
    ctx.fillStyle = itemCol;
    ctx.fillRect(rx, y2, rw, 2);

    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.55)';
    ctx.fillText(label as string, rx + 10, y2 + 18);

    const sign = n >= 0 ? '+' : '-';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = itemCol;
    ctx.shadowColor = itemCol; ctx.shadowBlur = 6;
    ctx.fillText(`${sign}${fEth(Math.abs(n))} Ξ`, rx + 10, y2 + 50);
    ctx.shadowBlur = 0;

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.5)';
    ctx.fillText(`${sign}${fUsd(Math.abs(n * data.ethPriceUsd))}`, rx + 10, y2 + 72);
  });

  // Top collections
  const colY = TOP + 220;
  ctx.fillStyle = 'rgba(0,180,255,0.08)';
  ctx.fillRect(rx, colY, rw, 108);
  ctx.strokeStyle = 'rgba(0,180,255,0.15)';
  ctx.strokeRect(rx, colY, rw, 108);
  ctx.fillStyle = '#00d4ff';
  ctx.fillRect(rx, colY, rw, 2);

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  ctx.fillText('TOP COLLECTIONS', rx + 10, colY + 18);

  if (data.topCollections.length === 0) {
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(150,180,200,0.3)';
    ctx.fillText('no collections synced yet', rx + 10, colY + 60);
  } else {
    data.topCollections.slice(0, 3).forEach((c, i) => {
      const cy = colY + 36 + i * 24;
      const sign = c.pnlEth >= 0 ? '+' : '';
      ctx.font = '11px monospace';
      ctx.fillStyle = '#e8f4ff';
      let cname = c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name;
      ctx.fillText(`${i + 1}. ${cname}`, rx + 10, cy);
      ctx.fillStyle = c.pnlEth >= 0 ? '#00ff88' : '#ff3355';
      ctx.textAlign = 'right';
      ctx.fillText(`${sign}${fEth(c.pnlEth)} Ξ`, rx + rw - 10, cy);
      ctx.textAlign = 'left';
    });
  }

  // ROI + win stats bottom-right
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(150,180,200,0.5)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `ROI ${fRoi(data.roiPct)}  ·  WIN RATE ${data.winRate.toFixed(0)}%  ·  ${data.wins}W/${data.losses}L`,
    W - 16, H - 78,
  );
  ctx.fillText(data.username.toUpperCase(), W - 16, H - 92);
  ctx.textAlign = 'left';

  drawBottomPnl(ctx, W, H, data.totalPnlEth, data.totalPnlUsd, data.roiPct);
  return canvas.toBuffer('image/png');
}
