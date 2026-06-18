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
