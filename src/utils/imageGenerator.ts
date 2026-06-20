import { createCanvas, loadImage } from '@napi-rs/canvas';

// ── Format helpers ─────────────────────────────────────────────
function fEth(n: number, d = 4): string { return Math.abs(n).toFixed(d); }
function fUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(a/1_000_000).toFixed(2)}M`;
  if (a >= 1_000)     return `$${(a/1_000).toFixed(1)}k`;
  return `$${a.toFixed(2)}`;
}
function fRoi(p: number): string {
  const s = p >= 0 ? '+' : '-'; const a = Math.abs(p);
  if (a >= 100_000) return `${s}${(a/1000).toFixed(0)}k%`;
  if (a >= 10_000)  return `${s}${(a/1000).toFixed(1)}k%`;
  return `${s}${a.toFixed(2)}%`;
}
function sign(n: number): string { return n >= 0 ? '+' : '-'; }
function trunc(a: string): string { return `${a.slice(0,6)}...${a.slice(-4)}`; }

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

const BG = '#07070e'; const TEXT = '#e8ecff';
const DIM = 'rgba(180,190,220,0.55)'; const DIMMER = 'rgba(140,150,190,0.35)';
const PROFIT = '#00e676'; const LOSS = '#ff3d71'; const ACCENT = '#4488ff';
const DIV = 'rgba(255,255,255,0.07)';
const W = 900; const H = 460;

function drawBackground(ctx: Ctx): void {
  ctx.fillStyle = BG; ctx.fillRect(0,0,W,H);
  const v = ctx.createRadialGradient(W/2,0,0,W/2,0,600);
  v.addColorStop(0,'rgba(30,60,180,0.12)'); v.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
}
function drawHeader(ctx: Ctx, username: string, right: string): void {
  const g = ctx.createLinearGradient(0,0,W,0);
  g.addColorStop(0,'#0044cc'); g.addColorStop(0.5,'#2200aa'); g.addColorStop(1,'#440099');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,52);
  ctx.font='bold 15px monospace'; ctx.fillStyle='#ffffff'; ctx.fillText('CONN3CT',20,33);
  ctx.font='bold 13px monospace'; ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.textAlign='center'; ctx.fillText(username.toUpperCase(),W/2,33); ctx.textAlign='left';
  ctx.font='11px monospace'; ctx.fillStyle='rgba(255,255,255,0.55)';
  ctx.textAlign='right'; ctx.fillText(right,W-20,33); ctx.textAlign='left';
}
function hline(ctx: Ctx, y: number, x0=0, x1=W, alpha=0.07): void {
  ctx.strokeStyle=`rgba(255,255,255,${alpha})`; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
}
function vline(ctx: Ctx, x: number, y0=52, y1=H-80): void {
  ctx.strokeStyle=DIV; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke();
}
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ── PNL Card ──────────────────────────────────────────────────
export interface PnlCardData {
  username: string; realizedPnlEth: number; unrealizedPnlEth: number;
  totalPnlEth: number; totalPnlUsd: number; costBasisEth: number;
  roiPct: number; winRate: number; totalTrades: number; wins: number; losses: number;
  bestTradeEth: number; worstTradeEth: number; avgHoldDays: number; ethPriceUsd: number;
}
export async function generatePnlCard(d: PnlCardData): Promise<Buffer> {
  const canvas = createCanvas(W,H); const ctx = canvas.getContext('2d');
  const pCol = d.totalPnlEth >= 0 ? PROFIT : LOSS;
  drawBackground(ctx); drawHeader(ctx,d.username,`1 ETH ~ ${fUsd(d.ethPriceUsd)}`);
  const lx=36, heroY=96;
  ctx.font='10px monospace'; ctx.fillStyle=DIM; ctx.fillText('TOTAL P&L',lx,heroY);
  ctx.font='bold 48px monospace'; ctx.fillStyle=pCol; ctx.shadowColor=pCol; ctx.shadowBlur=20;
  ctx.fillText(`${sign(d.totalPnlEth)}${fEth(d.totalPnlEth,4)} E`,lx,heroY+60); ctx.shadowBlur=0;
  ctx.font='bold 18px monospace'; ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.fillText(`${sign(d.totalPnlUsd)}${fUsd(d.totalPnlUsd)}`,lx,heroY+88);
  const roiStr=fRoi(d.roiPct); ctx.font='bold 13px monospace';
  const roiW=ctx.measureText(roiStr).width+20;
  ctx.fillStyle=d.totalPnlEth>=0?'rgba(0,230,118,0.12)':'rgba(255,61,113,0.12)';
  roundRect(ctx,lx,heroY+100,roiW,26,4); ctx.fill();
  ctx.strokeStyle=pCol; ctx.lineWidth=1; roundRect(ctx,lx,heroY+100,roiW,26,4); ctx.stroke();
  ctx.fillStyle=pCol; ctx.fillText(roiStr,lx+10,heroY+118);
  const wrY=heroY+148;
  ctx.font='10px monospace'; ctx.fillStyle=DIM; ctx.fillText('WIN RATE',lx,wrY);
  ctx.font='bold 22px monospace'; ctx.fillStyle=d.winRate>=50?PROFIT:LOSS;
  ctx.fillText(`${d.winRate.toFixed(0)}%`,lx,wrY+28);
  const bx=lx,by=wrY+36,bw=200,bh=8;
  ctx.fillStyle='rgba(255,255,255,0.08)'; roundRect(ctx,bx,by,bw,bh,4); ctx.fill();
  const fill=Math.min(d.winRate/100,1)*bw;
  const bgr=ctx.createLinearGradient(bx,0,bx+fill,0);
  bgr.addColorStop(0,ACCENT); bgr.addColorStop(1,PROFIT); ctx.fillStyle=bgr;
  roundRect(ctx,bx,by,fill,bh,4); ctx.fill();
  vline(ctx,460,64,H-88);
  const rx=492;
  const rows=[
    {label:'REALIZED P&L',eth:d.realizedPnlEth,signed:true},
    {label:'UNREALIZED P&L',eth:d.unrealizedPnlEth,signed:true},
    {label:'COST BASIS',eth:d.costBasisEth,signed:false},
  ];
  rows.forEach((r,i)=>{
    const ry=76+i*90; const rc=r.signed?(r.eth>=0?PROFIT:LOSS):TEXT; const s=r.signed?sign(r.eth):'';
    ctx.font='10px monospace'; ctx.fillStyle=DIM; ctx.fillText(r.label,rx,ry);
    ctx.font='bold 22px monospace'; ctx.fillStyle=rc;
    ctx.fillText(`${s}${fEth(Math.abs(r.eth),4)} E`,rx,ry+28);
    ctx.font='11px monospace'; ctx.fillStyle=DIMMER;
    ctx.fillText(`${s}${fUsd(Math.abs(r.eth)*d.ethPriceUsd)}`,rx,ry+46);
    if(i<rows.length-1) hline(ctx,ry+60,rx,W-20,0.06);
  });
  const btmY=H-80; hline(ctx,btmY,0,W,0.1);
  const stats=[
    {l:'TRADES',v:`${d.totalTrades}`},{l:'WINS',v:`${d.wins}`},{l:'LOSSES',v:`${d.losses}`},
    {l:'BEST',v:`+${fEth(d.bestTradeEth)} E`},{l:'WORST',v:`${sign(d.worstTradeEth)}${fEth(Math.abs(d.worstTradeEth))} E`},
    {l:'AVG HOLD',v:`${d.avgHoldDays}d`},
  ];
  const statW=W/stats.length;
  stats.forEach((s,i)=>{
    const sx=i*statW+statW/2;
    ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.textAlign='center'; ctx.fillText(s.l,sx,btmY+22);
    ctx.font='bold 14px monospace'; ctx.fillStyle=TEXT; ctx.fillText(s.v,sx,btmY+44);
    if(i>0) vline(ctx,i*statW,btmY,H);
  });
  ctx.textAlign='left';
  hline(ctx,H-20,0,W,0.06);
  ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.textAlign='right';
  ctx.fillText('CONN3CT PNL - Powered by OpenSea & Alchemy',W-20,H-7); ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ── Portfolio Card ────────────────────────────────────────────
export interface PortfolioCardData {
  username: string; walletCount: number; totalHoldings: number;
  portfolioValueEth: number; portfolioValueUsd: number; costBasisEth: number; gasFeeEth: number;
  realizedPnlEth: number; unrealizedPnlEth: number; totalPnlEth: number; totalPnlUsd: number;
  roiPct: number; winRate: number; wins: number; losses: number; totalTrades: number;
  bestTradeEth: number; topCollections: {name:string;holdings:number;pnlEth:number}[]; ethPriceUsd: number;
}
export async function generatePortfolioCard(d: PortfolioCardData): Promise<Buffer> {
  const canvas = createCanvas(W,H); const ctx = canvas.getContext('2d');
  const pCol = d.totalPnlEth >= 0 ? PROFIT : LOSS;
  drawBackground(ctx);
  drawHeader(ctx,d.username,`${d.totalHoldings} NFTs - ${d.walletCount} wallet${d.walletCount!==1?'s':''}`);
  const lx=36,heroY=90;
  ctx.font='10px monospace'; ctx.fillStyle=DIM; ctx.fillText('PORTFOLIO VALUE',lx,heroY);
  ctx.font='bold 42px monospace'; ctx.fillStyle=TEXT; ctx.fillText(`${fEth(d.portfolioValueEth,4)} E`,lx,heroY+55);
  ctx.font='bold 16px monospace'; ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fillText(fUsd(d.portfolioValueUsd),lx,heroY+80);
  hline(ctx,heroY+98,lx,440,0.08);
  [{l:'COST BASIS',v:`${fEth(d.costBasisEth,4)} E`,sub:fUsd(d.costBasisEth*d.ethPriceUsd)},
   {l:'GAS SPENT',v:`${fEth(d.gasFeeEth,4)} E`,sub:fUsd(d.gasFeeEth*d.ethPriceUsd)}].forEach((r,i)=>{
    const ry=heroY+116+i*68;
    ctx.font='9px monospace'; ctx.fillStyle=DIM; ctx.fillText(r.l,lx,ry);
    ctx.font='bold 18px monospace'; ctx.fillStyle=TEXT; ctx.fillText(r.v,lx,ry+24);
    ctx.font='11px monospace'; ctx.fillStyle=DIMMER; ctx.fillText(r.sub,lx,ry+42);
  });
  const wrY=heroY+260;
  ctx.font='9px monospace'; ctx.fillStyle=DIM; ctx.fillText('WIN RATE',lx,wrY);
  ctx.font='bold 16px monospace'; ctx.fillStyle=d.winRate>=50?PROFIT:LOSS;
  ctx.fillText(`${d.winRate.toFixed(0)}%  (${d.wins}W / ${d.losses}L)`,lx,wrY+20);
  ctx.fillStyle='rgba(255,255,255,0.07)'; roundRect(ctx,lx,wrY+28,200,6,3); ctx.fill();
  const f2=Math.min(d.winRate/100,1)*200;
  const bg2=ctx.createLinearGradient(lx,0,lx+f2,0);
  bg2.addColorStop(0,ACCENT); bg2.addColorStop(1,PROFIT); ctx.fillStyle=bg2;
  roundRect(ctx,lx,wrY+28,f2,6,3); ctx.fill();
  vline(ctx,460,64,H-88);
  const rx=492;
  ctx.font='10px monospace'; ctx.fillStyle=DIM; ctx.fillText('P&L BREAKDOWN',rx,76);
  [{l:'REALIZED',eth:d.realizedPnlEth},{l:'UNREALIZED',eth:d.unrealizedPnlEth},{l:'TOTAL P&L',eth:d.totalPnlEth,big:true}].forEach((r,i)=>{
    const ry=98+i*68; const rc=r.eth>=0?PROFIT:LOSS; const s=sign(r.eth);
    ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.fillText(r.l,rx,ry);
    ctx.font=r.big?'bold 22px monospace':'bold 18px monospace'; ctx.fillStyle=rc;
    if(r.big){ctx.shadowColor=rc;ctx.shadowBlur=10;}
    ctx.fillText(`${s}${fEth(Math.abs(r.eth),4)} E`,rx,ry+24); ctx.shadowBlur=0;
    ctx.font='10px monospace'; ctx.fillStyle=DIMMER; ctx.textAlign='right';
    ctx.fillText(`${s}${fUsd(Math.abs(r.eth*d.ethPriceUsd))}`,W-20,ry+24); ctx.textAlign='left';
    if(i<2) hline(ctx,ry+36,rx,W-20,0.05);
  });
  const roiStr=fRoi(d.roiPct); ctx.font='bold 12px monospace';
  const rbw=ctx.measureText(roiStr).width+18;
  ctx.fillStyle=d.totalPnlEth>=0?'rgba(0,230,118,0.1)':'rgba(255,61,113,0.1)';
  roundRect(ctx,rx,306,rbw,24,4); ctx.fill();
  ctx.strokeStyle=pCol; ctx.lineWidth=1; roundRect(ctx,rx,306,rbw,24,4); ctx.stroke();
  ctx.fillStyle=pCol; ctx.fillText(roiStr,rx+9,322);
  hline(ctx,344,rx,W-20,0.08);
  ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.fillText('TOP COLLECTIONS',rx,362);
  if(d.topCollections.length===0){
    ctx.font='11px monospace'; ctx.fillStyle=DIMMER; ctx.fillText('sync a wallet to see collections',rx,386);
  } else {
    d.topCollections.slice(0,3).forEach((c,i)=>{
      const cy=380+i*24; const name=c.name.length>22?c.name.slice(0,21)+'...':c.name;
      ctx.font='12px monospace'; ctx.fillStyle=TEXT; ctx.fillText(`${i+1}. ${name}`,rx,cy);
      ctx.fillStyle=c.pnlEth>=0?PROFIT:LOSS; ctx.textAlign='right';
      ctx.fillText(`${sign(c.pnlEth)}${fEth(Math.abs(c.pnlEth),4)} E`,W-20,cy); ctx.textAlign='left';
    });
  }
  hline(ctx,H-80,0,W,0.1);
  [{l:'TRADES',v:`${d.totalTrades}`},{l:'BEST',v:`+${fEth(d.bestTradeEth)} E`},{l:'ROI',v:fRoi(d.roiPct)}].forEach((s,i)=>{
    const sw=W/3,sx=i*sw+sw/2;
    ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.textAlign='center'; ctx.fillText(s.l,sx,H-58);
    ctx.font='bold 14px monospace'; ctx.fillStyle=TEXT; ctx.fillText(s.v,sx,H-38);
    if(i>0) vline(ctx,i*sw,H-80,H-20);
  });
  ctx.textAlign='left';
  hline(ctx,H-20,0,W,0.06);
  ctx.font='9px monospace'; ctx.fillStyle=DIMMER; ctx.textAlign='right';
  ctx.fillText('CONN3CT PNL - Powered by OpenSea & Alchemy',W-20,H-7); ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ── Meme character draw functions (300×360 coordinate space) ──

function drawMemeProfit(ctx: Ctx): void {
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(148,310,82,36,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#1a3d1a'; roundRect(ctx,90,192,108,108,14); ctx.fill();
  ctx.strokeStyle='#1a3d1a'; ctx.lineWidth=24;
  ctx.beginPath(); ctx.moveTo(90,208); ctx.quadraticCurveTo(48,162,40,126); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(198,208); ctx.quadraticCurveTo(240,162,248,126); ctx.stroke();
  ctx.fillStyle='#c8a060';
  ctx.beginPath(); ctx.arc(38,118,17,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(250,118,17,0,Math.PI*2); ctx.fill();
  roundRect(ctx,124,164,40,32,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(144,146,54,56,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(10,10,10,0.96)';
  roundRect(ctx,102,132,38,22,8); ctx.fill(); roundRect(ctx,144,132,38,22,8); ctx.fill();
  ctx.strokeStyle='#333'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(140,143); ctx.lineTo(144,143); ctx.stroke();
  ctx.strokeStyle='#222'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(102,143); ctx.lineTo(97,137); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(182,143); ctx.lineTo(187,137); ctx.stroke();
  ctx.strokeStyle='#7a4d00'; ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.moveTo(116,172); ctx.quadraticCurveTo(144,188,172,172); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.9)'; roundRect(ctx,126,174,36,10,3); ctx.fill();
  ctx.fillStyle='#2a1e00';
  ctx.beginPath(); ctx.moveTo(98,112); ctx.quadraticCurveTo(144,84,190,112);
  ctx.quadraticCurveTo(178,86,144,80); ctx.quadraticCurveTo(110,86,98,112); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#00FF57'; ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.moveTo(250,52); ctx.lineTo(250,72); ctx.stroke();
  ctx.fillStyle='#00CC44'; roundRect(ctx,235,72,30,52,4); ctx.fill();
  ctx.fillStyle='rgba(0,255,87,0.5)'; roundRect(ctx,235,72,30,12,4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(250,124); ctx.lineTo(250,134); ctx.stroke();
  ctx.fillStyle='rgba(0,255,87,0.07)'; ctx.beginPath(); ctx.arc(250,98,30,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,59,59,0.65)'; roundRect(ctx,26,105,16,20,3); ctx.fill();
  ctx.strokeStyle='rgba(255,59,59,0.6)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(34,100); ctx.lineTo(34,105); ctx.stroke();
  ctx.textAlign='left';
  ctx.font='bold 20px monospace'; ctx.fillStyle='rgba(0,255,87,0.65)'; ctx.fillText('$',62,82);
  ctx.font='bold 15px monospace'; ctx.fillStyle='rgba(0,255,87,0.45)'; ctx.fillText('$',196,68);
  ctx.font='bold 13px monospace'; ctx.fillStyle='rgba(0,255,87,0.35)'; ctx.fillText('$',74,56);
}

function drawMemeLoss(ctx: Ctx): void {
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(148,320,78,28,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#2a1010'; roundRect(ctx,94,202,100,106,12); ctx.fill();
  ctx.strokeStyle='#2a1010'; ctx.lineWidth=22;
  ctx.beginPath(); ctx.moveTo(94,220); ctx.quadraticCurveTo(58,248,52,286); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(194,220); ctx.quadraticCurveTo(230,248,236,286); ctx.stroke();
  ctx.fillStyle='#c8a060';
  ctx.beginPath(); ctx.arc(50,292,15,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(238,292,15,0,Math.PI*2); ctx.fill();
  roundRect(ctx,124,174,38,32,6); ctx.fill();
  ctx.beginPath(); ctx.ellipse(143,156,52,54,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#cc1100'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(103,140); ctx.lineTo(117,154); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(117,140); ctx.lineTo(103,154); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(169,140); ctx.lineTo(183,154); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(183,140); ctx.lineTo(169,154); ctx.stroke();
  ctx.fillStyle='rgba(51,119,255,0.65)';
  ctx.beginPath(); ctx.ellipse(110,162,5,9,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(176,162,5,9,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(51,119,255,0.45)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(108,171); ctx.quadraticCurveTo(106,184,110,194); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(178,171); ctx.quadraticCurveTo(180,184,176,194); ctx.stroke();
  ctx.strokeStyle='#7a3a00'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(118,178); ctx.quadraticCurveTo(143,164,168,178); ctx.stroke();
  ctx.fillStyle='#2a1e00';
  ctx.beginPath(); ctx.moveTo(100,122); ctx.quadraticCurveTo(143,96,186,122);
  ctx.quadraticCurveTo(172,96,143,90); ctx.quadraticCurveTo(114,96,100,122); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#FF3B3B'; ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.moveTo(238,264); ctx.lineTo(238,276); ctx.stroke();
  ctx.fillStyle='#CC1111'; roundRect(ctx,222,276,30,56,4); ctx.fill();
  ctx.fillStyle='rgba(255,59,59,0.5)'; roundRect(ctx,222,316,30,16,4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(238,332); ctx.lineTo(238,344); ctx.stroke();
  ctx.fillStyle='rgba(255,59,59,0.07)'; ctx.beginPath(); ctx.arc(238,304,28,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(42,10,10,0.85)'; roundRect(ctx,34,278,32,24,5); ctx.fill();
  ctx.strokeStyle='#FF3B3B'; ctx.lineWidth=1.5; roundRect(ctx,34,278,32,24,5); ctx.stroke();
  ctx.font='bold 8px monospace'; ctx.fillStyle='#FF5555'; ctx.textAlign='center';
  ctx.fillText('REKT',50,294); ctx.textAlign='left';
  ctx.font='bold 22px monospace'; ctx.fillStyle='rgba(255,59,59,0.4)'; ctx.fillText('v',76,92);
  ctx.font='bold 17px monospace'; ctx.fillStyle='rgba(255,59,59,0.35)'; ctx.fillText('v',186,108);
}

function drawMemeNeutral(ctx: Ctx): void {
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(148,312,76,30,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#181830'; roundRect(ctx,92,194,104,108,12); ctx.fill();
  ctx.strokeStyle='#181830'; ctx.lineWidth=22;
  ctx.beginPath(); ctx.moveTo(92,214); ctx.quadraticCurveTo(68,202,60,190); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(196,214); ctx.quadraticCurveTo(222,198,228,176); ctx.stroke();
  ctx.fillStyle='#c8a060';
  ctx.beginPath(); ctx.arc(58,182,14,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(230,168,14,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#12122a'; roundRect(ctx,234,118,48,64,6); ctx.fill();
  ctx.strokeStyle='#7777cc'; ctx.lineWidth=2; roundRect(ctx,234,118,48,64,6); ctx.stroke();
  ctx.strokeStyle='#aaaaff'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(240,174); ctx.lineTo(247,162); ctx.lineTo(255,166);
  ctx.lineTo(264,150); ctx.lineTo(273,154); ctx.lineTo(280,140); ctx.stroke();
  ctx.fillStyle='#c8a060'; roundRect(ctx,124,166,38,32,6); ctx.fill();
  ctx.beginPath(); ctx.ellipse(143,148,52,54,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#2a1400'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(108,140); ctx.quadraticCurveTo(119,134,130,140); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(156,140); ctx.quadraticCurveTo(167,134,178,140); ctx.stroke();
  ctx.fillStyle='#2a1400';
  ctx.beginPath(); ctx.arc(119,144,5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(167,144,5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#7a4800'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(120,170); ctx.quadraticCurveTo(143,180,166,170); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(108,126); ctx.quadraticCurveTo(120,120,132,125); ctx.stroke();
  ctx.fillStyle='#2a1e00';
  ctx.beginPath(); ctx.moveTo(100,114); ctx.quadraticCurveTo(143,88,186,114);
  ctx.quadraticCurveTo(172,90,143,84); ctx.quadraticCurveTo(114,90,100,114); ctx.closePath(); ctx.fill();
  ctx.textAlign='left';
  ctx.font='bold 20px monospace'; ctx.fillStyle='rgba(153,153,255,0.45)'; ctx.fillText('?',58,80);
  ctx.font='bold 16px monospace'; ctx.fillStyle='rgba(170,170,255,0.35)'; ctx.fillText('?',196,72);
}

// ── Logo (matches HTML SVG exactly: viewBox 300×160) ──────────
function drawLogoV2(ctx: Ctx, x: number, y: number, displayW: number): void {
  const s = displayW / 300;
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=7;
  ctx.beginPath(); ctx.arc(100,80,72,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(190,80,72,0,Math.PI*2); ctx.stroke();
  ctx.textAlign='center';
  ctx.font='22px monospace'; ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillText('CONN',76,86);
  ctx.font='bold 26px monospace'; ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillText('3',147,86);
  ctx.font='19px monospace'; ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.fillText('CTIVITY',218,86);
  ctx.textAlign='left'; ctx.restore();
}

// ── Collection Profit Card — v2 design ────────────────────────
export interface CollectionPnlImageData {
  collectionName: string; collectionImageUrl?: string; contractAddress: string;
  walletLabel: string; totalSupply: number | null; holdersCount: number | null;
  floorPriceEth: number; spentEth: number; salesEth: number; holdingValueEth: number;
  gasFeeEth: number; mintCount: number; buyCount: number; sellCount: number; heldCount: number;
  realizedPnlEth: number; unrealizedPnlEth: number; totalPnlEth: number; totalPnlUsd: number;
  roiPct: number; ethPriceUsd: number;
}

export async function generatePnlImage(d: CollectionPnlImageData): Promise<Buffer> {
  const CW = 900, CH = 470;
  const canvas = createCanvas(CW, CH);
  const ctx = canvas.getContext('2d');

  // State
  const state: 'profit'|'loss'|'neutral' =
    d.totalPnlEth > 0.0001 ? 'profit' : d.totalPnlEth < -0.0001 ? 'loss' : 'neutral';
  const pCol   = state==='profit' ? '#00FF57' : state==='loss' ? '#FF3B3B' : '#9999ff';
  const pGlow  = state==='profit' ? 'rgba(0,255,87,0.45)' : state==='loss' ? 'rgba(255,59,59,0.45)' : 'rgba(153,153,255,0.35)';

  // Background gradient
  const bg = ctx.createLinearGradient(0,0,CW*0.7,CH);
  if (state==='profit') {
    bg.addColorStop(0,'#030f06'); bg.addColorStop(0.45,'#071a0d'); bg.addColorStop(1,'#040d07');
  } else if (state==='loss') {
    bg.addColorStop(0,'#100303'); bg.addColorStop(0.45,'#1c0606'); bg.addColorStop(1,'#0f0303');
  } else {
    bg.addColorStop(0,'#08080f'); bg.addColorStop(0.45,'#10101e'); bg.addColorStop(1,'#08080f');
  }
  ctx.fillStyle=bg; roundRect(ctx,0,0,CW,CH,18); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  roundRect(ctx,0.5,0.5,CW-1,CH-1,18); ctx.stroke();

  // Background chart
  const chartPts: [number,number][] = [];
  for (let i=0; i<=16; i++) {
    const x=(i/16)*CW;
    let y: number;
    if (state==='profit')     y = CH*0.78 - (i/16)*CH*0.58 + Math.sin(i*1.4)*28;
    else if (state==='loss')  y = CH*0.22 + (i/16)*CH*0.58 + Math.sin(i*1.3)*24;
    else                      y = CH*0.5  + Math.sin(i*0.9)*55 + Math.sin(i*2.3)*18;
    chartPts.push([x,y]);
  }
  // Fill
  ctx.beginPath(); ctx.moveTo(0,CH);
  chartPts.forEach(([x,y]) => ctx.lineTo(x,y));
  ctx.lineTo(CW,CH); ctx.closePath();
  ctx.globalAlpha=0.10; ctx.fillStyle=pCol; ctx.fill(); ctx.globalAlpha=1;
  // Line
  ctx.beginPath(); chartPts.forEach(([x,y],i) => i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
  ctx.strokeStyle=pCol; ctx.lineWidth=2; ctx.globalAlpha=0.13; ctx.stroke(); ctx.globalAlpha=1;
  // Second line offset
  ctx.beginPath(); chartPts.forEach(([x,y],i) => i===0?ctx.moveTo(x,y+28):ctx.lineTo(x,y+28));
  ctx.lineWidth=1.5; ctx.globalAlpha=0.06; ctx.stroke(); ctx.globalAlpha=1;

  // Left glow
  const glow = ctx.createRadialGradient(-50,CH*0.55,0,-50,CH*0.55,CW*0.7);
  glow.addColorStop(0, state==='profit'?'rgba(0,255,80,0.09)':state==='loss'?'rgba(255,40,40,0.09)':'rgba(120,120,255,0.06)');
  glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow; ctx.fillRect(0,0,CW,CH);

  // Meme character (right side, 300×360 space)
  const MEME_X = 562;
  const memeScale = (CW - MEME_X) / 300;  // 338/300 = 1.127
  const MEME_Y = CH - Math.round(360 * memeScale); // bottom-aligned
  ctx.save();
  ctx.translate(MEME_X, MEME_Y);
  ctx.scale(memeScale, memeScale);
  if (state==='profit')  drawMemeProfit(ctx);
  else if (state==='loss') drawMemeLoss(ctx);
  else                   drawMemeNeutral(ctx);
  ctx.restore();

  // ── LEFT CONTENT ──────────────────────────────────────────
  const PX = 40;

  // CONN3CTIVITY logo top-right of content area (matches HTML top-row flex)
  drawLogoV2(ctx, 430, 24, 90);

  // Token name (large, Bebas Neue style — bold mono approximation)
  const tokenFull = d.collectionName.toUpperCase();
  let tname = tokenFull;
  ctx.font = 'bold 72px monospace';
  while (ctx.measureText(tname).width > 370 && tname.length > 3)
    tname = tname.slice(0,-1);
  if (tname.length < tokenFull.length) tname += '..';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = state==='profit'?'rgba(0,255,80,0.1)':state==='loss'?'rgba(255,50,50,0.1)':'rgba(255,255,255,0.08)';
  ctx.shadowBlur = 50;
  ctx.fillText(tname, PX, 95);
  ctx.shadowBlur = 0;

  // Stats block
  const SY = 122;
  const boughtCnt = d.mintCount + d.buyCount;
  const statRows = [
    {key:'BOUGHT', count:`(${boughtCnt})`, val:`${fEth(d.spentEth,3)} ETH`},
    {key:'SOLD',   count:`(${d.sellCount})`, val:`${fEth(d.salesEth,3)} ETH`},
    {key:'HOLDING',count:`(${d.heldCount})`, val:`${fEth(d.holdingValueEth,3)} ETH`},
  ];
  statRows.forEach((r, i) => {
    const ry = SY + i*34;
    ctx.font='bold 16px monospace'; ctx.fillStyle='rgba(255,255,255,0.92)';
    ctx.fillText(r.key, PX, ry);
    ctx.font='16px monospace'; ctx.fillStyle='rgba(255,255,255,0.42)';
    ctx.fillText(r.count, PX+112, ry);
    ctx.font='bold 16px monospace'; ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.fillText(r.val, PX+162, ry);
  });

  // PNL block
  const PNL_Y = SY + 3*34 + 14;
  ctx.font='bold 10px monospace'; ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.fillText('PNL', PX, PNL_Y);

  // Big USD
  const absUsd = Math.abs(d.totalPnlUsd);
  const usdStr = absUsd>=1_000_000 ? (absUsd/1_000_000).toFixed(2)+'M'
               : absUsd>=1_000      ? (absUsd/1_000).toFixed(0)+'k'
               : absUsd.toFixed(0);
  const usdDisplay = (d.totalPnlUsd<0?'-$':'$') + usdStr;
  ctx.font='bold 62px monospace'; ctx.fillStyle=pCol; ctx.shadowColor=pGlow; ctx.shadowBlur=40;
  ctx.fillText(usdDisplay, PX, PNL_Y+72); ctx.shadowBlur=0;

  // PNL sub-line: ETH + % + gas
  const ethStr  = `${fEth(Math.abs(d.totalPnlEth),3)} ETH`;
  const pctStr  = (d.roiPct>=0?'+':'-')+Math.abs(d.roiPct).toFixed(0)+'%';
  const gasNote = d.gasFeeEth>0 ? `  incl. ${fEth(d.gasFeeEth,4)} ETH gas` : '';
  ctx.font='bold 13px monospace'; ctx.fillStyle='rgba(255,255,255,0.52)';
  ctx.fillText(ethStr, PX, PNL_Y+92);
  const ethW = ctx.measureText(ethStr).width;
  ctx.fillStyle=pCol; ctx.fillText(pctStr, PX+ethW+10, PNL_Y+92);
  const pctW = ctx.measureText(pctStr).width;
  ctx.font='12px monospace'; ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.fillText(gasNote, PX+ethW+10+pctW+8, PNL_Y+92);

  // Footer divider
  const FY = CH - 52;
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,FY); ctx.lineTo(560,FY); ctx.stroke();

  // QR dots (5×5 decorative)
  const QX=PX, QY=FY+8;
  const qrP=[1,1,1,0,1, 1,0,1,0,1, 1,0,0,1,1, 1,0,1,1,1, 1,0,0,0,1];
  for (let i=0; i<25; i++) {
    const col=i%5, row=Math.floor(i/5);
    ctx.fillStyle = qrP[i] ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)';
    ctx.fillRect(QX+col*7+1, QY+row*7+1, 5, 5);
  }
  ctx.strokeStyle='rgba(255,255,255,0.14)'; ctx.lineWidth=1;
  ctx.strokeRect(QX, QY, 36, 36);

  // Brand
  ctx.font='bold 13px monospace'; ctx.fillStyle='rgba(255,255,255,0.7)';
  ctx.fillText('CONN3CTIVITY', QX+44, QY+13);
  ctx.font='8px monospace'; ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.fillText('CUSTOM PNL BOT', QX+44, QY+25);

  // Handle + avatar
  const handle = d.walletLabel.length > 14 ? trunc(d.walletLabel) : d.walletLabel;
  ctx.textAlign='right';
  ctx.font='bold 12px monospace'; ctx.fillStyle='rgba(255,255,255,0.58)';
  ctx.fillText(`@${handle.toUpperCase()}`, 554, QY+14);
  // Avatar circle
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(520, QY+24, 17, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.arc(520, QY+24, 17, 0, Math.PI*2); ctx.fill();
  ctx.font='bold 12px monospace'; ctx.fillStyle='rgba(255,255,255,0.65)';
  const initials = d.walletLabel.replace('@','').slice(0,2).toUpperCase();
  ctx.fillText(initials, 520, QY+29); ctx.textAlign='left';

  // Collection thumbnail small (bottom-left corner near QR)
  if (d.collectionImageUrl) {
    try {
      const img = await loadImage(d.collectionImageUrl);
      ctx.save();
      roundRect(ctx, QX, QY-44, 36, 36, 3); ctx.clip();
      ctx.drawImage(img, QX, QY-44, 36, 36);
      ctx.restore();
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
      roundRect(ctx, QX, QY-44, 36, 36, 3); ctx.stroke();
    } catch { /* no thumbnail */ }
  }

  return canvas.toBuffer('image/png');
}
