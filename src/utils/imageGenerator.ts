import { createCanvas, loadImage } from '@napi-rs/canvas';

// ── Palette ───────────────────────────────────────────────────
const BG      = '#07070e';
const TEXT    = '#e8ecff';
const DIM     = 'rgba(180,190,220,0.55)';
const DIMMER  = 'rgba(140,150,190,0.35)';
const PROFIT  = '#00e676';
const LOSS    = '#ff3d71';
const ACCENT  = '#4488ff';
const DIV     = 'rgba(255,255,255,0.07)';
const W = 900;
const H = 460;

// ── Format helpers ────────────────────────────────────────────
function fEth(n: number, d = 4): string { return Math.abs(n).toFixed(d); }
function fUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(a/1_000_000).toFixed(2)}M`;
  if (a >= 1_000)     return `$${(a/1_000).toFixed(2)}k`;
  return `$${a.toFixed(2)}`;
}
function fRoi(p: number): string {
  const s = p >= 0 ? '+' : '-';
  const a = Math.abs(p);
  if (a >= 100_000) return `${s}${(a/1000).toFixed(0)}k%`;
  if (a >= 10_000)  return `${s}${(a/1000).toFixed(1)}k%`;
  return `${s}${a.toFixed(2)}%`;
}
function sign(n: number): string { return n >= 0 ? '+' : '-'; }
function trunc(a: string): string { return `${a.slice(0,6)}…${a.slice(-4)}`; }

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

// ── Shared draw helpers ───────────────────────────────────────
function drawBackground(ctx: Ctx): void {
  // Deep dark base
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // Subtle blue vignette at top
  const v = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, 600);
  v.addColorStop(0, 'rgba(30,60,180,0.12)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx: Ctx, username: string, right: string): void {
  // Gradient top strip
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   '#0044cc');
  g.addColorStop(0.5, '#2200aa');
  g.addColorStop(1,   '#440099');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 52);

  // Branding
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('◈ CONN3CT', 20, 33);

  // Username centre
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText(username.toUpperCase(), W/2, 33);
  ctx.textAlign = 'left';

  // Right label
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText(right, W - 20, 33);
  ctx.textAlign = 'left';
}

function hline(ctx: Ctx, y: number, x0 = 0, x1 = W, alpha = 0.07): void {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
}
function vline(ctx: Ctx, x: number, y0 = 52, y1 = H - 80): void {
  ctx.strokeStyle = DIV;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ── PNL Card ──────────────────────────────────────────────────
export interface PnlCardData {
  username: string;
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

export async function generatePnlCard(d: PnlCardData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pCol = d.totalPnlEth >= 0 ? PROFIT : LOSS;

  drawBackground(ctx);
  drawHeader(ctx, d.username, `1 ETH ≈ ${fUsd(d.ethPriceUsd)}`);

  // ── Left: Hero P&L ────────────────────────────────────────
  const lx = 36, heroY = 96;

  ctx.font = '10px monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('TOTAL P&L', lx, heroY);

  // Big number
  const heroStr = `${sign(d.totalPnlEth)}${fEth(d.totalPnlEth, 4)} Ξ`;
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = pCol;
  ctx.shadowColor = pCol;
  ctx.shadowBlur = 20;
  ctx.fillText(heroStr, lx, heroY + 60);
  ctx.shadowBlur = 0;

  // USD
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${sign(d.totalPnlUsd)}${fUsd(d.totalPnlUsd)}`, lx, heroY + 88);

  // ROI badge
  const roiStr = fRoi(d.roiPct);
  ctx.font = 'bold 13px monospace';
  const roiW = ctx.measureText(roiStr).width + 20;
  ctx.fillStyle = d.totalPnlEth >= 0 ? 'rgba(0,230,118,0.12)' : 'rgba(255,61,113,0.12)';
  roundRect(ctx, lx, heroY + 100, roiW, 26, 4);
  ctx.fill();
  ctx.strokeStyle = pCol;
  ctx.lineWidth = 1;
  roundRect(ctx, lx, heroY + 100, roiW, 26, 4);
  ctx.stroke();
  ctx.fillStyle = pCol;
  ctx.fillText(roiStr, lx + 10, heroY + 118);

  // Win rate bar (left, below roi)
  const wrY = heroY + 148;
  ctx.font = '10px monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('WIN RATE', lx, wrY);
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = d.winRate >= 50 ? PROFIT : LOSS;
  ctx.fillText(`${d.winRate.toFixed(0)}%`, lx, wrY + 28);

  const bx = lx, by = wrY + 36, bw = 200, bh = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
  const fill = Math.min(d.winRate / 100, 1) * bw;
  const bg = ctx.createLinearGradient(bx, 0, bx + fill, 0);
  bg.addColorStop(0, ACCENT); bg.addColorStop(1, PROFIT);
  ctx.fillStyle = bg;
  roundRect(ctx, bx, by, fill, bh, 4); ctx.fill();

  // ── Divider ───────────────────────────────────────────────
  vline(ctx, 460, 64, H - 88);

  // ── Right: Breakdown ──────────────────────────────────────
  const rx = 492;
  const rows: { label: string; eth: number; signed: boolean }[] = [
    { label: 'REALIZED P&L',   eth: d.realizedPnlEth,   signed: true },
    { label: 'UNREALIZED P&L', eth: d.unrealizedPnlEth, signed: true },
    { label: 'COST BASIS',     eth: d.costBasisEth,     signed: false },
  ];

  rows.forEach((r, i) => {
    const ry = 76 + i * 90;
    const rc = r.signed ? (r.eth >= 0 ? PROFIT : LOSS) : TEXT;
    const s  = r.signed ? sign(r.eth) : '';

    ctx.font = '10px monospace';
    ctx.fillStyle = DIM;
    ctx.fillText(r.label, rx, ry);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = rc;
    ctx.fillText(`${s}${fEth(Math.abs(r.eth), 4)} Ξ`, rx, ry + 28);

    ctx.font = '11px monospace';
    ctx.fillStyle = DIMMER;
    ctx.fillText(`${s}${fUsd(Math.abs(r.eth) * d.ethPriceUsd)}`, rx, ry + 46);

    if (i < rows.length - 1) hline(ctx, ry + 60, rx, W - 20, 0.06);
  });

  // ── Bottom stats strip ────────────────────────────────────
  const btmY = H - 80;
  hline(ctx, btmY, 0, W, 0.1);

  const stats: { l: string; v: string }[] = [
    { l: 'TRADES',   v: `${d.totalTrades}` },
    { l: 'WINS',     v: `${d.wins}` },
    { l: 'LOSSES',   v: `${d.losses}` },
    { l: 'BEST',     v: `+${fEth(d.bestTradeEth)} Ξ` },
    { l: 'WORST',    v: `${sign(d.worstTradeEth)}${fEth(Math.abs(d.worstTradeEth))} Ξ` },
    { l: 'AVG HOLD', v: `${d.avgHoldDays}d` },
  ];

  const statW = W / stats.length;
  stats.forEach((s, i) => {
    const sx = i * statW + statW / 2;
    ctx.font = '9px monospace';
    ctx.fillStyle = DIMMER;
    ctx.textAlign = 'center';
    ctx.fillText(s.l, sx, btmY + 22);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = TEXT;
    ctx.fillText(s.v, sx, btmY + 44);
    if (i > 0) vline(ctx, i * statW, btmY, H, );
  });
  ctx.textAlign = 'left';

  // Footer line
  hline(ctx, H - 20, 0, W, 0.06);
  ctx.font = '9px monospace';
  ctx.fillStyle = DIMMER;
  ctx.textAlign = 'right';
  ctx.fillText('CONN3CT PNL · Powered by OpenSea & Alchemy', W - 20, H - 7);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ── Portfolio Card ────────────────────────────────────────────
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

export async function generatePortfolioCard(d: PortfolioCardData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pCol = d.totalPnlEth >= 0 ? PROFIT : LOSS;

  drawBackground(ctx);
  drawHeader(
    ctx,
    d.username,
    `${d.totalHoldings} NFTs · ${d.walletCount} wallet${d.walletCount !== 1 ? 's' : ''}`,
  );

  // ── Left: Portfolio Value hero ────────────────────────────
  const lx = 36, heroY = 90;

  ctx.font = '10px monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('PORTFOLIO VALUE', lx, heroY);

  ctx.font = 'bold 42px monospace';
  ctx.fillStyle = TEXT;
  ctx.fillText(`${fEth(d.portfolioValueEth, 4)} Ξ`, lx, heroY + 55);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(fUsd(d.portfolioValueUsd), lx, heroY + 80);

  // Cost + gas
  hline(ctx, heroY + 98, lx, 440, 0.08);

  const smallRows = [
    { l: 'COST BASIS', v: `${fEth(d.costBasisEth, 4)} Ξ`, sub: fUsd(d.costBasisEth * d.ethPriceUsd) },
    { l: 'GAS SPENT',  v: `${fEth(d.gasFeeEth, 4)} Ξ`,   sub: fUsd(d.gasFeeEth * d.ethPriceUsd) },
  ];
  smallRows.forEach((r, i) => {
    const ry = heroY + 116 + i * 68;
    ctx.font = '9px monospace'; ctx.fillStyle = DIM;
    ctx.fillText(r.l, lx, ry);
    ctx.font = 'bold 18px monospace'; ctx.fillStyle = TEXT;
    ctx.fillText(r.v, lx, ry + 24);
    ctx.font = '11px monospace'; ctx.fillStyle = DIMMER;
    ctx.fillText(r.sub, lx, ry + 42);
  });

  // Win rate
  const wrY = heroY + 260;
  ctx.font = '9px monospace'; ctx.fillStyle = DIM;
  ctx.fillText('WIN RATE', lx, wrY);
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = d.winRate >= 50 ? PROFIT : LOSS;
  ctx.fillText(`${d.winRate.toFixed(0)}%  (${d.wins}W / ${d.losses}L)`, lx, wrY + 20);
  const bw2 = 200, bh2 = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, lx, wrY + 28, bw2, bh2, 3); ctx.fill();
  const f2 = Math.min(d.winRate/100,1)*bw2;
  const bg2 = ctx.createLinearGradient(lx, 0, lx+f2, 0);
  bg2.addColorStop(0, ACCENT); bg2.addColorStop(1, PROFIT);
  ctx.fillStyle = bg2;
  roundRect(ctx, lx, wrY + 28, f2, bh2, 3); ctx.fill();

  // ── Divider ───────────────────────────────────────────────
  vline(ctx, 460, 64, H - 88);

  // ── Right: P&L + top collections ─────────────────────────
  const rx = 492;

  ctx.font = '10px monospace'; ctx.fillStyle = DIM;
  ctx.fillText('P&L BREAKDOWN', rx, 76);

  const pnlRows = [
    { l: 'REALIZED',   eth: d.realizedPnlEth,   signed: true },
    { l: 'UNREALIZED', eth: d.unrealizedPnlEth, signed: true },
    { l: 'TOTAL P&L',  eth: d.totalPnlEth,      signed: true, big: true },
  ];
  pnlRows.forEach((r, i) => {
    const ry = 98 + i * 68;
    const rc = r.eth >= 0 ? PROFIT : LOSS;
    const s = sign(r.eth);

    ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
    ctx.fillText(r.l, rx, ry);

    ctx.font = r.big ? 'bold 22px monospace' : 'bold 18px monospace';
    ctx.fillStyle = rc;
    if (r.big) { ctx.shadowColor = rc; ctx.shadowBlur = 10; }
    ctx.fillText(`${s}${fEth(Math.abs(r.eth), 4)} Ξ`, rx, ry + 24);
    ctx.shadowBlur = 0;

    ctx.font = '10px monospace'; ctx.fillStyle = DIMMER;
    ctx.textAlign = 'right';
    ctx.fillText(`${s}${fUsd(Math.abs(r.eth * d.ethPriceUsd))}`, W - 20, ry + 24);
    ctx.textAlign = 'left';

    if (i < pnlRows.length - 1) hline(ctx, ry + 36, rx, W - 20, 0.05);
  });

  // ROI badge
  const roiStr = fRoi(d.roiPct);
  ctx.font = 'bold 12px monospace';
  const rbw = ctx.measureText(roiStr).width + 18;
  ctx.fillStyle = d.totalPnlEth >= 0 ? 'rgba(0,230,118,0.1)' : 'rgba(255,61,113,0.1)';
  roundRect(ctx, rx, 306, rbw, 24, 4); ctx.fill();
  ctx.strokeStyle = pCol; ctx.lineWidth = 1;
  roundRect(ctx, rx, 306, rbw, 24, 4); ctx.stroke();
  ctx.fillStyle = pCol; ctx.fillText(roiStr, rx + 9, 322);

  // Top collections
  hline(ctx, 344, rx, W - 20, 0.08);
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
  ctx.fillText('TOP COLLECTIONS', rx, 362);

  if (d.topCollections.length === 0) {
    ctx.font = '11px monospace'; ctx.fillStyle = DIMMER;
    ctx.fillText('sync a wallet to see collections', rx, 386);
  } else {
    d.topCollections.slice(0, 3).forEach((c, i) => {
      const cy = 380 + i * 24;
      let name = c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name;
      ctx.font = '12px monospace'; ctx.fillStyle = TEXT;
      ctx.fillText(`${i+1}. ${name}`, rx, cy);
      ctx.fillStyle = c.pnlEth >= 0 ? PROFIT : LOSS;
      ctx.textAlign = 'right';
      ctx.fillText(`${sign(c.pnlEth)}${fEth(Math.abs(c.pnlEth), 4)} Ξ`, W - 20, cy);
      ctx.textAlign = 'left';
    });
  }

  // ── Bottom stats ──────────────────────────────────────────
  hline(ctx, H - 80, 0, W, 0.1);
  const stats = [
    { l: 'TRADES', v: `${d.totalTrades}` },
    { l: 'BEST',   v: `+${fEth(d.bestTradeEth)} Ξ` },
    { l: 'ROI',    v: fRoi(d.roiPct) },
  ];
  const sw = W / stats.length;
  stats.forEach((s, i) => {
    const sx = i * sw + sw/2;
    ctx.font = '9px monospace'; ctx.fillStyle = DIMMER; ctx.textAlign = 'center';
    ctx.fillText(s.l, sx, H - 58);
    ctx.font = 'bold 14px monospace'; ctx.fillStyle = TEXT;
    ctx.fillText(s.v, sx, H - 38);
    if (i > 0) vline(ctx, i * sw, H - 80, H - 20);
  });
  ctx.textAlign = 'left';

  hline(ctx, H - 20, 0, W, 0.06);
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
  ctx.textAlign = 'right';
  ctx.fillText('CONN3CT PNL · Powered by OpenSea & Alchemy', W - 20, H - 7);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ── Collection Profit Card (/profit) ─────────────────────────
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

export async function generatePnlImage(d: CollectionPnlImageData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pCol = d.totalPnlEth >= 0 ? PROFIT : LOSS;

  drawBackground(ctx);

  // ── Header ────────────────────────────────────────────────
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#0044cc'); g.addColorStop(0.5, '#2200aa'); g.addColorStop(1, '#440099');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 52);
  ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText('◈ CONN3CT', 20, 33);
  ctx.font = 'bold 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'center'; ctx.fillText('COLLECTION P&L', W/2, 33); ctx.textAlign = 'left';
  ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right'; ctx.fillText(d.walletLabel, W - 20, 33); ctx.textAlign = 'left';

  // ── Collection image (left panel) ────────────────────────
  const imgSize = 180, imgX = 20, imgY = 68;
  if (d.collectionImageUrl) {
    try {
      const img = await loadImage(d.collectionImageUrl);
      ctx.save();
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.clip();
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.stroke();
    } catch {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.fill();
  }

  // Collection name + contract
  ctx.font = 'bold 13px monospace'; ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  let name = d.collectionName.toUpperCase();
  while (ctx.measureText(name).width > 200 && name.length > 1) name = name.slice(0, -1);
  if (name.length < d.collectionName.length) name += '…';
  ctx.fillText(name, imgX + imgSize/2, imgY + imgSize + 22);
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
  ctx.fillText(trunc(d.contractAddress), imgX + imgSize/2, imgY + imgSize + 38);

  // Count badges
  const badges = [
    { l: 'MINT', v: d.mintCount },
    { l: 'BUY',  v: d.buyCount },
    { l: 'SELL', v: d.sellCount },
    { l: 'HELD', v: d.heldCount },
  ];
  const bW = imgSize / 2;
  badges.forEach((b, i) => {
    const bx = imgX + (i % 2) * bW;
    const by = imgY + imgSize + 52 + Math.floor(i/2) * 44;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(bx + 2, by, bW - 4, 38);
    ctx.font = '8px monospace'; ctx.fillStyle = DIMMER; ctx.textAlign = 'center';
    ctx.fillText(b.l, bx + bW/2, by + 13);
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = b.v > 0 ? TEXT : DIMMER;
    ctx.fillText(String(b.v), bx + bW/2, by + 30);
  });
  ctx.textAlign = 'left';

  // ── Right: data rows ──────────────────────────────────────
  vline(ctx, 224, 64, H - 80);
  const rx = 244;
  const dataRows = [
    { l: 'SPENT',      v: d.spentEth,        signed: false },
    { l: 'SALES',      v: d.salesEth,        signed: false },
    { l: 'HOLDING',    v: d.holdingValueEth, signed: false },
    { l: 'GAS FEES',   v: d.gasFeeEth,       signed: false },
  ];
  const rowH2 = (H - 52 - 88) / dataRows.length;
  dataRows.forEach((r, i) => {
    const ry = 64 + i * rowH2;
    if (i > 0) hline(ctx, ry, rx, W - 20, 0.06);
    ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
    ctx.fillText(r.l, rx, ry + 18);
    ctx.font = 'bold 24px monospace'; ctx.fillStyle = TEXT;
    ctx.fillText(`${fEth(r.v, 4)} Ξ`, rx, ry + 46);
    ctx.font = '11px monospace'; ctx.fillStyle = DIMMER;
    ctx.textAlign = 'right';
    ctx.fillText(fUsd(r.v * d.ethPriceUsd), W - 20, ry + 46);
    ctx.textAlign = 'left';
  });

  // ── Bottom P&L ────────────────────────────────────────────
  hline(ctx, H - 80, 0, W, 0.12);
  ctx.fillStyle = d.totalPnlEth >= 0 ? 'rgba(0,230,118,0.06)' : 'rgba(255,61,113,0.06)';
  ctx.fillRect(0, H - 80, W, 80);

  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
  ctx.fillText('TOTAL P&L', 20, H - 58);

  const s = sign(d.totalPnlEth);
  ctx.font = 'bold 36px monospace'; ctx.fillStyle = pCol;
  ctx.shadowColor = pCol; ctx.shadowBlur = 14;
  ctx.fillText(`${s}${fEth(Math.abs(d.totalPnlEth), 4)} Ξ`, 20, H - 24);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 18px monospace'; ctx.fillStyle = pCol;
  ctx.fillText(`${s}${fUsd(Math.abs(d.totalPnlUsd))}`, 340, H - 24);

  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'right'; ctx.shadowColor = pCol; ctx.shadowBlur = 8;
  ctx.fillText(fRoi(d.roiPct), W - 20, H - 24);
  ctx.shadowBlur = 0; ctx.textAlign = 'left';

  // Realized / Unrealized split
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER;
  ctx.textAlign = 'right';
  ctx.fillText(
    `REALIZED ${sign(d.realizedPnlEth)}${fEth(d.realizedPnlEth,4)} Ξ  ·  UNREALIZED ${sign(d.unrealizedPnlEth)}${fEth(d.unrealizedPnlEth,4)} Ξ`,
    W - 20, H - 60,
  );
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
