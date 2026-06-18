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

// ── Collection Profit Card (/profit) — CRT Terminal ──────────
export interface CollectionPnlImageData {
  collectionName: string;
  collectionImageUrl?: string;
  contractAddress: string;
  walletLabel: string;
  totalSupply: number | null;
  holdersCount: number | null;
  floorPriceEth: number;
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
  const CW = 900, CH = 540;
  const canvas = createCanvas(CW, CH);
  const ctx = canvas.getContext('2d');

  // CRT palette
  const AMBER    = '#ff9900';
  const GOLD     = '#ffcc44';
  const DIM_A    = 'rgba(255,153,0,0.6)';
  const DIMMER_A = 'rgba(255,130,0,0.32)';
  const SCREEN   = '#060100';
  const pCol     = d.totalPnlEth >= 0 ? '#aaff44' : '#ff5522';

  const gT = (text: string, x: number, y: number, col: string, blur = 8) => {
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = blur;
    ctx.fillText(text, x, y); ctx.shadowBlur = 0;
  };

  // ── Machine frame ─────────────────────────────────────────
  const fg = ctx.createLinearGradient(0, 0, 0, CH);
  fg.addColorStop(0, '#2e1205'); fg.addColorStop(0.55, '#1c0a02'); fg.addColorStop(1, '#0e0601');
  ctx.fillStyle = fg;
  roundRect(ctx, 0, 0, CW, CH, 16); ctx.fill();
  ctx.strokeStyle = '#3d1a07'; ctx.lineWidth = 2;
  roundRect(ctx, 2, 2, CW-4, CH-4, 14); ctx.stroke();
  ctx.strokeStyle = '#0a0400'; ctx.lineWidth = 1;
  roundRect(ctx, 5, 5, CW-10, CH-10, 12); ctx.stroke();

  // ── CRT screen ───────────────────────────────────────────
  const SX = 36, SY = 22, SW = CW - 72, SH = 406;
  const SX2 = SX + SW, SY2 = SY + SH;

  ctx.fillStyle = '#000'; ctx.fillRect(SX-5, SY-5, SW+10, SH+10);
  ctx.fillStyle = SCREEN; ctx.fillRect(SX, SY, SW, SH);

  // Phosphor glow
  const ph = ctx.createRadialGradient(SX+SW/2, SY+SH/2, 20, SX+SW/2, SY+SH/2, SW*0.75);
  ph.addColorStop(0, 'rgba(255,110,0,0.05)'); ph.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ph; ctx.fillRect(SX, SY, SW, SH);

  // Grid
  ctx.strokeStyle = 'rgba(255,100,0,0.055)'; ctx.lineWidth = 0.5;
  for (let x = SX; x <= SX2; x += 18) { ctx.beginPath(); ctx.moveTo(x, SY); ctx.lineTo(x, SY2); ctx.stroke(); }
  for (let y = SY; y <= SY2; y += 18) { ctx.beginPath(); ctx.moveTo(SX, y); ctx.lineTo(SX2, y); ctx.stroke(); }

  // Scanlines
  for (let y = SY; y < SY2; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(SX, y+1, SW, 1); }

  // Vignette
  const sv = ctx.createRadialGradient(SX+SW/2, SY+SH/2, SH*0.28, SX+SW/2, SY+SH/2, SW*0.76);
  sv.addColorStop(0, 'rgba(0,0,0,0)'); sv.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = sv; ctx.fillRect(SX, SY, SW, SH);

  // ── TOP: Name box + branding ──────────────────────────────
  const HDR_Y = SY + 60;

  // Collection name box
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
  ctx.strokeRect(SX+8, SY+8, 290, 68);
  ctx.fillStyle = 'rgba(255,100,0,0.07)'; ctx.fillRect(SX+8, SY+8, 290, 68);
  ctx.font = 'bold 22px monospace';
  let cname = d.collectionName.toUpperCase();
  while (ctx.measureText(cname).width > 272) cname = cname.slice(0,-1);
  if (cname.length < d.collectionName.length) cname += '…';
  gT(cname, SX + 18, SY + 50, GOLD, 14);

  // Branding right
  ctx.font = 'bold 26px monospace';
  gT('CONN3CT', SX + 338, SY + 38, AMBER, 18);
  ctx.font = '10px monospace'; ctx.fillStyle = DIM_A;
  ctx.fillText('CUSTOM PNL BOT', SX + 338, SY + 56);
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER_A;
  ctx.textAlign = 'right'; ctx.fillText(trunc(d.contractAddress), SX2-8, SY+70); ctx.textAlign = 'left';

  // Header divider
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SX+8, HDR_Y+4); ctx.lineTo(SX2-8, HDR_Y+4); ctx.stroke();

  // ── LEFT PANEL: data rows ─────────────────────────────────
  const LX = SX + 14;
  const COL_DIV = SX + 310;
  const DY = HDR_Y + 28;

  // 'L' + vertical bar
  ctx.font = 'bold 14px monospace'; gT('L', LX, DY, AMBER, 10);
  ctx.strokeStyle = DIM_A; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(LX+18, DY-6); ctx.lineTo(LX+18, DY+136); ctx.stroke();

  const lRows = [
    { label: 'SPENT',   val: d.spentEth },
    { label: 'SALES',   val: d.salesEth },
    { label: 'HOLDING', val: d.holdingValueEth },
  ];
  lRows.forEach((r, i) => {
    const ry = DY + 26 + i * 50;
    ctx.font = 'bold 13px monospace'; gT('>', LX+26, ry, DIM_A, 4);
    ctx.font = 'bold 22px monospace'; gT(`${fEth(r.val, 3)} Ξ`, LX+48, ry, GOLD, 10);
    ctx.font = 'bold 11px monospace'; ctx.fillStyle = DIM_A;
    ctx.textAlign = 'right'; ctx.fillText(r.label, COL_DIV-10, ry); ctx.textAlign = 'left';
  });

  // Dashes + PROFIT button
  const DASH_Y = DY + 26 + 3*50 + 6;
  ctx.font = '13px monospace'; ctx.fillStyle = DIMMER_A;
  ctx.fillText('-'.repeat(22), LX+26, DASH_Y);

  const PBX = LX+26, PBY = DASH_Y+12, PBW = 198, PBH = 36;
  ctx.fillStyle = 'rgba(255,140,0,0.14)'; ctx.fillRect(PBX, PBY, PBW, PBH);
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5; ctx.strokeRect(PBX, PBY, PBW, PBH);
  ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
  gT('PROFIT', PBX + PBW/2, PBY+25, GOLD, 12); ctx.textAlign = 'left';

  // ── VERTICAL DIVIDER ─────────────────────────────────────
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(COL_DIV, HDR_Y+12); ctx.lineTo(COL_DIV, SY2-92); ctx.stroke();

  // ── RIGHT PANEL: grid table ───────────────────────────────
  const GX = COL_DIV+12, GY = HDR_Y+14;
  const GW = SX2 - GX - 8;
  const ROW_H = 52;
  const C1 = 52, C2 = 82;

  const gRows = [
    { cnt: d.mintCount,  type: 'MINT', val: String(d.mintCount),  sub: '' },
    { cnt: d.buyCount,   type: 'BUY',  val: String(d.buyCount),   sub: '' },
    {
      cnt: d.sellCount,  type: 'SOLD',
      val: d.sellCount > 0 ? fEth(d.salesEth / Math.max(d.sellCount,1), 3) : '0',
      sub: d.sellCount > 0 ? 'EACH' : '',
    },
    {
      cnt: d.heldCount, type: 'HELD',
      val: d.floorPriceEth > 0 ? fEth(d.floorPriceEth, 3) : String(d.heldCount),
      sub: d.floorPriceEth > 0 ? 'FLOOR' : '',
    },
  ];

  // Outer box
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
  ctx.strokeRect(GX, GY, GW, ROW_H * gRows.length);
  ctx.fillStyle = 'rgba(255,100,0,0.04)'; ctx.fillRect(GX+1, GY+1, GW-2, ROW_H*gRows.length-2);

  gRows.forEach((r, i) => {
    const ry = GY + i * ROW_H;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,140,0,0.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(GX, ry); ctx.lineTo(GX+GW, ry); ctx.stroke();
    }
    // col1: count
    ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    gT(String(r.cnt), GX+C1/2, ry+ROW_H/2+9, r.cnt > 0 ? GOLD : DIMMER_A, r.cnt > 0 ? 10 : 3);
    // divider
    ctx.strokeStyle = 'rgba(255,140,0,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(GX+C1, ry); ctx.lineTo(GX+C1, ry+ROW_H); ctx.stroke();
    // col2: type
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    gT(r.type, GX+C1+C2/2, ry+ROW_H/2+5, DIM_A, 4);
    ctx.beginPath(); ctx.moveTo(GX+C1+C2, ry); ctx.lineTo(GX+C1+C2, ry+ROW_H); ctx.stroke();
    // col3: value
    const VX = GX+C1+C2+10; ctx.textAlign = 'left';
    ctx.font = 'bold 18px monospace';
    gT(r.val !== '0' ? r.val : '0', VX, ry+ROW_H/2+4, r.val !== '0' ? GOLD : DIMMER_A, r.val !== '0' ? 8 : 3);
    if (r.sub) { ctx.font = '9px monospace'; ctx.fillStyle = DIM_A; ctx.fillText(r.sub, VX, ry+ROW_H/2+18); }
  });

  // Wallet label below grid
  ctx.font = 'bold 10px monospace'; ctx.fillStyle = DIM_A;
  ctx.textAlign = 'right';
  ctx.fillText(d.walletLabel.toUpperCase(), SX2-12, GY + ROW_H*gRows.length + 18);
  ctx.textAlign = 'left';

  // ── PROFIT BAR ───────────────────────────────────────────
  const PBR_Y = SY2 - 88;
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(SX+8, PBR_Y); ctx.lineTo(SX2-8, PBR_Y); ctx.stroke();
  ctx.fillStyle = d.totalPnlEth >= 0 ? 'rgba(150,255,50,0.06)' : 'rgba(255,60,0,0.06)';
  ctx.fillRect(SX, PBR_Y, SW, SH-(PBR_Y-SY));

  // ROI %
  const rStr = `${Math.abs(d.roiPct) >= 1000 ? Math.round(Math.abs(d.roiPct)/1000)+'k' : Math.abs(d.roiPct).toFixed(0)}%`;
  ctx.font = 'bold 17px monospace'; gT(rStr, SX+18, PBR_Y+32, pCol, 12);

  // === decorators
  ctx.font = '13px monospace'; ctx.fillStyle = DIM_A; ctx.textAlign = 'center';
  ctx.fillText('═'.repeat(7), SX+108, PBR_Y+32); ctx.textAlign = 'left';

  // ETH hero
  const pS = d.totalPnlEth >= 0 ? '' : '-';
  ctx.font = 'bold 32px monospace';
  gT(`${pS}${fEth(Math.abs(d.totalPnlEth), 3)} Ξ`, SX+168, PBR_Y+36, pCol, 20);

  ctx.font = '13px monospace'; ctx.fillStyle = DIM_A; ctx.textAlign = 'center';
  ctx.fillText('═'.repeat(7), SX+474, PBR_Y+32); ctx.textAlign = 'left';

  // USD
  ctx.font = 'bold 20px monospace';
  gT(`${pS}${fUsd(Math.abs(d.totalPnlUsd))}`, SX+530, PBR_Y+36, pCol, 10);

  // Realized / Unrealized small
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER_A; ctx.textAlign = 'right';
  ctx.fillText(
    `REALIZED ${pS}${fEth(Math.abs(d.realizedPnlEth),3)} Ξ   UNREALIZED ${sign(d.unrealizedPnlEth)}${fEth(Math.abs(d.unrealizedPnlEth),3)} Ξ`,
    SX2-10, PBR_Y+56,
  ); ctx.textAlign = 'left';

  // ── STATUS BAR ────────────────────────────────────────────
  const STAT_Y = SY2 - 26;
  ctx.fillStyle = 'rgba(255,80,0,0.08)'; ctx.fillRect(SX, STAT_Y-4, SW, 30);
  ctx.strokeStyle = 'rgba(255,140,0,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SX, STAT_Y-4); ctx.lineTo(SX2, STAT_Y-4); ctx.stroke();
  const supply = d.totalSupply != null ? d.totalSupply.toLocaleString() : '---';
  const holders = d.holdersCount != null ? d.holdersCount.toLocaleString() : '---';
  ctx.font = '10px monospace'; ctx.fillStyle = DIM_A;
  ctx.fillText(`GAS: ${fEth(d.gasFeeEth,4)} Ξ  ·  SUPPLY: ${supply}  ·  HOLDERS: ${holders}`, SX+10, STAT_Y+16);

  // ── MACHINE BOTTOM PANEL ─────────────────────────────────
  const BOT_Y = SY2 + 12;
  ctx.strokeStyle = '#3d1a07'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, BOT_Y-4); ctx.lineTo(CW-20, BOT_Y-4); ctx.stroke();

  // Collection thumbnail
  const TW = 56, TH = 56, TX = 28, TY_img = BOT_Y + 6;
  if (d.collectionImageUrl) {
    try {
      const img = await loadImage(d.collectionImageUrl);
      ctx.save();
      roundRect(ctx, TX, TY_img, TW, TH, 4); ctx.clip();
      ctx.drawImage(img, TX, TY_img, TW, TH);
      ctx.restore();
      ctx.strokeStyle = AMBER; ctx.lineWidth = 1;
      roundRect(ctx, TX, TY_img, TW, TH, 4); ctx.stroke();
    } catch {
      ctx.fillStyle = '#150802'; ctx.fillRect(TX, TY_img, TW, TH);
      ctx.strokeStyle = DIMMER_A; ctx.lineWidth = 1; ctx.strokeRect(TX, TY_img, TW, TH);
      ctx.font = '7px monospace'; ctx.fillStyle = DIMMER_A; ctx.textAlign = 'center';
      ctx.fillText('NO IMG', TX+TW/2, TY_img+TH/2+3); ctx.textAlign = 'left';
    }
  } else {
    ctx.fillStyle = '#150802'; ctx.fillRect(TX, TY_img, TW, TH);
    ctx.strokeStyle = DIMMER_A; ctx.lineWidth = 1; ctx.strokeRect(TX, TY_img, TW, TH);
    ctx.font = '7px monospace'; ctx.fillStyle = DIMMER_A; ctx.textAlign = 'center';
    ctx.fillText('NO IMG', TX+TW/2, TY_img+TH/2+3); ctx.textAlign = 'left';
  }

  // Wallet label + contract below image
  ctx.font = 'bold 13px monospace';
  gT(d.walletLabel.toUpperCase(), TX+TW+16, TY_img+20, AMBER, 8);
  ctx.font = '9px monospace'; ctx.fillStyle = DIM_A;
  ctx.fillText(trunc(d.contractAddress), TX+TW+16, TY_img+38);

  // ROI multiplier far right
  const mult = d.roiPct > 0 ? (d.roiPct/100+1).toFixed(1) : '0.0';
  ctx.textAlign = 'right';
  ctx.font = 'bold 30px monospace'; gT(`${mult}x`, CW-28, TY_img+38, pCol, 18);
  ctx.font = '9px monospace'; ctx.fillStyle = DIMMER_A;
  ctx.fillText('ON INVESTMENT', CW-28, TY_img+54); ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
