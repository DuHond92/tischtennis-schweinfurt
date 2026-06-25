// ╔══════════════════════════════════════════════════════════════╗
// ║           RANGLISTE                                          ║
// ╚══════════════════════════════════════════════════════════════╝
function getLeague(elo) {
  if(elo >= 800) return {name:'🥇 Gold', cls:'g'};
  if(elo >= 400) return {name:'🥈 Silber', cls:'s'};
  return {name:'🥉 Bronze', cls:'b'};
}

function renderLeaderboard() {
  const myId = sb.getUserId();
  const src = allPlayers.length ? allPlayers : [];
  if(!src.length) {
    document.getElementById('leaderboard-list').innerHTML =
      `<div style="text-align:center;padding:32px;color:var(--text-dim);">Rangliste wird geladen…</div>`;
    return;
  }
  const c = document.getElementById('leaderboard-list');
  c.innerHTML = src.map((p,i)=>{
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    const cls = i===0?'top1':i===1?'top2':i===2?'top3':'';
    const rcls = i===0?'g':i===1?'s':i===2?'b':'';
    const league = getLeague(p.elo);
    const total = (p.wins||0)+(p.losses||0);
    const wr = total ? Math.round((p.wins||0)/total*100) : 0;
    const isMe = p.id === myId;
    return `<div class="lb-row ${cls} ${isMe?'me':''}">
      <div class="lb-rank ${rcls}">${medal}</div>
      <div class="lb-avatar">${getAvatarContent(p)}</div>
      <div class="lb-info">
        <div class="lb-name">${p.username||'Spieler'}${isMe?' <span style="font-size:0.7rem;color:var(--primary);font-weight:700;">(Du)</span>':''}</div>
        <div class="lb-tier">${league.name}</div>
      </div>
      <div style="text-align:right;">
        <div class="lb-elo">${p.elo} <span style="font-size:0.7rem;color:var(--text-dim);">ELO</span></div>
        <div class="lb-wr">${p.wins||0}W / ${p.losses||0}L · ${wr}%</div>
      </div>
    </div>`;
  }).join('');

  // Mein Rank-Card aktualisieren falls eingeloggt
  if(currentUser) {
    const myRank = src.findIndex(p=>p.id===myId)+1;
    const league = getLeague(currentUser.elo||200);
    document.querySelector('.myrank-name').textContent = currentUser.username;
    document.querySelector('.myrank-elo').textContent  = currentUser.elo || 200;
    document.querySelector('.myrank-tier').textContent = `${league.name} · Platz ${myRank||'?'}`;
    // Progress bar Silber: 400-800, hier 400 offset
    const elo = currentUser.elo || 200;
    const pct = elo < 400 ? (elo/400*100)
               : elo < 800 ? ((elo-400)/400*100) : 100;
    document.querySelector('.rp-fill').style.width = Math.min(pct,100)+'%';
    // Liga-Label
    if(elo<400) { document.querySelector('.rp-labels span:first-child').textContent='Bronze · 0 ELO';
                  document.querySelector('.rp-labels span:last-child').textContent='Silber ab 400 ELO'; }
    else if(elo<800) { document.querySelector('.rp-labels span:first-child').textContent=`Silber · ${elo} ELO`;
                       document.querySelector('.rp-labels span:last-child').textContent='Gold ab 800 ELO'; }
    else { document.querySelector('.rp-labels span:first-child').textContent=`Gold · ${elo} ELO`;
           document.querySelector('.rp-labels span:last-child').textContent='🏆 Höchste Liga!'; }
  }
}

async function submitMatch() {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  const opponentSel = document.querySelector('#report-match-sheet select');
  const resultSel   = document.querySelectorAll('#report-match-sheet select')[1];
  const scoreInput  = document.querySelector('#report-match-sheet input[placeholder="3:1"]');
  const tableSel    = document.getElementById('match-table-sel');

  const scores = scoreInput.value.split(':').map(Number);
  const isWin  = resultSel.value === 'win';
  const myId   = sb.getUserId();

  // Für jetzt: Wir brauchen eine richtige Spieler-Suche – erstmal als Demo-Flow
  const qb = new QueryBuilder('matches');
  const {error} = await qb.insert({
    winner_id:    isWin ? myId : null,
    loser_id:     isWin ? null : myId,
    reported_by:  myId,
    score_winner: scores[0]||0,
    score_loser:  scores[1]||0,
    table_id:     parseInt(tableSel.value)||1,
    elo_change:   15,
    confirmed:    false
  });
  closeAllSheets();
  if(error) { showToast('Fehler beim Eintragen','❌'); return; }
  showToast('🎮 Match eingereicht – warte auf Bestätigung!','🎮');
}
