// ============================================================
// STATE
// ============================================================
let playerStats = {};
let playerQP = 0;
let completedSet = new Set();
let activeFilters = new Set(['all']);
let showCompleted = true;
let randFilters = new Set(['Quest','Boss','Activity/Goal','Unlock','Miniquest','Diary','incomplete','available']);
let bossKC = {}; // { [order]: number }
let obtainedDrops = {}; // { ["order-dropName"]: true }
let spinHistory = [];
let currentSpinItem = null;
let userNotes = {};

const SKILLS = [
  {name:'Attack',emoji:'⚔️'},{name:'Strength',emoji:'💪'},{name:'Defence',emoji:'🛡️'},
  {name:'Hitpoints',emoji:'❤️'},{name:'Ranged',emoji:'🏹'},{name:'Prayer',emoji:'✨'},
  {name:'Magic',emoji:'🔮'},{name:'Cooking',emoji:'🍳'},{name:'Woodcutting',emoji:'🪓'},
  {name:'Fletching',emoji:'🪶'},{name:'Fishing',emoji:'🎣'},{name:'Firemaking',emoji:'🔥'},
  {name:'Crafting',emoji:'✂️'},{name:'Smithing',emoji:'🔨'},{name:'Mining',emoji:'⛏️'},
  {name:'Herblore',emoji:'🌿'},{name:'Agility',emoji:'🏃'},{name:'Thieving',emoji:'🦝'},
  {name:'Slayer',emoji:'💀'},{name:'Farming',emoji:'🌱'},{name:'Runecraft',emoji:'🔷'},
  {name:'Hunter',emoji:'🦊'},{name:'Construction',emoji:'🏠'},{name:'Sailing',emoji:'⛵'},
];

// ============================================================
// INIT
// ============================================================
function init() {
  loadFromStorage();
  buildSkillsGrid();
  renderTable();
  updateProgress();
  updateCombatDisplay();
}

function loadFromStorage() {
  try {
    const s = localStorage.getItem('osrs_spine_stats');
    if (s) playerStats = JSON.parse(s);
    const q = localStorage.getItem('osrs_spine_qp');
    if (q) playerQP = parseInt(q) || 0;
    const c = localStorage.getItem('osrs_spine_completed');
    if (c) completedSet = new Set(JSON.parse(c));
    const n = localStorage.getItem('osrs_spine_notes');
    if (n) userNotes = JSON.parse(n);
    const k = localStorage.getItem('osrs_spine_kc');
    if (k) bossKC = JSON.parse(k);
    const od = localStorage.getItem('osrs_spine_drops');
    if (od) obtainedDrops = JSON.parse(od);
  } catch(e) {}
}

function saveToStorage() {
  localStorage.setItem('osrs_spine_stats', JSON.stringify(playerStats));
  localStorage.setItem('osrs_spine_qp', playerQP);
  localStorage.setItem('osrs_spine_completed', JSON.stringify([...completedSet]));
  localStorage.setItem('osrs_spine_notes', JSON.stringify(userNotes));
  localStorage.setItem('osrs_spine_kc', JSON.stringify(bossKC));
  localStorage.setItem('osrs_spine_drops', JSON.stringify(obtainedDrops));
}

function saveNote(order, text) {
  if (text.trim()) {
    userNotes[order] = text;
  } else {
    delete userNotes[order];
  }
  localStorage.setItem('osrs_spine_notes', JSON.stringify(userNotes));
  // Refresh the row in the table to show/hide note indicator
  const row = document.querySelector(`tr[data-order="${order}"]`);
  if (row) {
    const ind = row.querySelector('.note-indicator');
    if (text.trim()) {
      if (!ind) {
        const nameCell = row.querySelector('.td-name');
        if (nameCell) nameCell.insertAdjacentHTML('beforeend', '<span class="note-indicator" title="Has notes">📝</span>');
      }
    } else {
      if (ind) ind.remove();
    }
  }
}

// ============================================================
// SKILL REQUIREMENTS PARSING
// ============================================================
function parseSkillReqs(reqStr) {
  if (!reqStr) return [];
  const results = [];
  // "Skill Level (boostable/unboostable); Skill Level ..."
  const parts = reqStr.split(';').map(s => s.trim());
  for (const part of parts) {
    const m = part.match(/^(.+?)\s+(\d+)(\s*\(.*?\))?$/);
    if (m) {
      results.push({
        skill: m[1].trim(),
        level: parseInt(m[2]),
        note: m[3] ? m[3].trim() : '',
        boostable: part.toLowerCase().includes('boostable') && !part.toLowerCase().includes('unboostable'),
        unboostable: part.toLowerCase().includes('unboostable'),
        isQP: m[1].trim().toLowerCase().includes('quest point')
      });
    }
  }
  return results;
}

function getCombatLevel() {
  const s = playerStats;
  if (!s || Object.keys(s).length === 0) return 3;
  const defence = s.defence || 1;
  const hitpoints = s.hitpoints || 10;
  const prayer = s.prayer || 1;
  const attack = s.attack || 1;
  const strength = s.strength || 1;
  const ranged = s.ranged || 1;
  const magic = s.magic || 1;
  const base = 0.25 * (defence + hitpoints + Math.floor(prayer / 2));
  const melee = 0.325 * (attack + strength);
  const rangedCalc = 0.325 * Math.floor(ranged * 1.5);
  const magicCalc = 0.325 * Math.floor(magic * 1.5);
  return Math.floor(base + Math.max(melee, rangedCalc, magicCalc));
}

function getTotalLevel() {
  if (!playerStats || Object.keys(playerStats).length === 0) return 0;
  return Object.values(playerStats).reduce((sum, v) => sum + (v || 1), 0);
}

function meetsReqs(item) {
  const hasSkillStats = Object.keys(playerStats).length > 0;
  const hasQP = playerQP > 0;

  if (!hasSkillStats && !hasQP) return null;

  const reqs = parseSkillReqs(item.skillReqs);
  for (const req of reqs) {
    if (req.isQP) {
      if (!hasQP) continue;
      if (playerQP < req.level) return false;
    } else if (req.skill.toLowerCase() === 'combat') {
      if (!hasSkillStats) continue;
      const have = getCombatLevel();
      if (have < req.level) return false;
    } else if (req.skill.toLowerCase() === 'total level' || req.skill.toLowerCase() === 'total') {
      if (!hasSkillStats) continue;
      const have = getTotalLevel();
      if (have < req.level) return false;
    } else {
      if (!hasSkillStats) continue;
      const have = playerStats[req.skill.toLowerCase()] || 1;
      if (have < req.level) return false;
    }
  }

  if (item.questPrereqs) {
    const prereqs = item.questPrereqs.split(';').map(s => s.trim()).filter(Boolean);
    for (const prereq of prereqs) {
      const found = SPINE_DATA.find(d => d.name.toLowerCase() === prereq.toLowerCase());
      if (found && !completedSet.has(found.order)) return false;
    }
  }

  return true;
}

// Check if a "Base X" or skill-only activity is auto-achievable given current stats
function isAutoAchievable(item) {
  if (!item.skillReqs || item.type !== 'Activity/Goal') return false;
  // Base X patterns: "All skills X+"
  const baseMatch = item.skillReqs.match(/All skills\s+(\d+)\+/i);
  if (baseMatch) {
    if (Object.keys(playerStats).length === 0) return false;
    const needed = parseInt(baseMatch[1]);
    // Check all 24 skills meet the threshold
    const skillNames = ['attack','strength','defence','hitpoints','ranged','prayer','magic','cooking','woodcutting','fletching','fishing','firemaking','crafting','smithing','mining','herblore','agility','thieving','slayer','farming','runecraft','hunter','construction','sailing'];
    return skillNames.every(sk => (playerStats[sk] || 1) >= needed);
  }
  return false;
}

// ============================================================
// RSN LOOKUP
// ============================================================
async function lookupRSN() {
  const rsn = document.getElementById('rsn-input').value.trim();
  if (!rsn) return;

  const statusDiv = document.getElementById('lookup-status');
  const statusInner = document.getElementById('lookup-status-inner');
  statusDiv.style.display = 'block';
  statusInner.className = 'status-inner';
  statusInner.textContent = '⏳ Looking up ' + rsn + '…';

  try {
    // Use JSON endpoint — returns named skills + activities (bosses) in one call
    const proxy = 'https://corsproxy.io/?';
    const url = proxy + `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(rsn)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Player not found');
    const data = await resp.json();

    // --- Skills ---
    const skillMap = {
      'Attack':'attack','Defence':'defence','Strength':'strength','Hitpoints':'hitpoints',
      'Ranged':'ranged','Prayer':'prayer','Magic':'magic','Cooking':'cooking',
      'Woodcutting':'woodcutting','Fletching':'fletching','Fishing':'fishing',
      'Firemaking':'firemaking','Crafting':'crafting','Smithing':'smithing',
      'Mining':'mining','Herblore':'herblore','Agility':'agility','Thieving':'thieving',
      'Slayer':'slayer','Farming':'farming','Runecraft':'runecraft','Hunter':'hunter',
      'Construction':'construction','Sailing':'sailing'
    };
    const newStats = {};
    (data.skills || []).forEach(s => {
      const key = skillMap[s.name];
      if (key && s.level > 0) newStats[key] = Math.max(1, s.level);
    });
    playerStats = newStats;

    // --- Boss KC ---
    // Build a lookup: normalised spine name → order
    const spineNameMap = {};
    SPINE_DATA.forEach(item => {
      if (item.entryType === 'boss' || item.type === 'Boss') {
        // normalise: lowercase, strip punctuation/spaces
        const norm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        spineNameMap[norm] = item.order;
      }
    });

    let kcUpdated = 0;
    (data.activities || []).forEach(activity => {
      const kc = activity.score;
      if (!kc || kc < 1) return;
      const norm = activity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Direct match first
      if (spineNameMap[norm] !== undefined) {
        bossKC[spineNameMap[norm]] = kc;
        kcUpdated++;
        return;
      }
      // Partial match — hiscore name contains spine name or vice versa
      for (const [spineName, order] of Object.entries(spineNameMap)) {
        if (norm.includes(spineName) || spineName.includes(norm)) {
          bossKC[order] = kc;
          kcUpdated++;
          break;
        }
      }
    });

    saveToStorage();
    syncSkillsGridFromStats();
    // Auto-complete base achievements from skill levels
    SPINE_DATA.forEach(item => {
      if (isAutoAchievable(item) && !completedSet.has(item.order)) {
        completedSet.add(item.order);
      }
    });
    // Auto-complete bosses where KC > 0 and no notable drops to track
    SPINE_DATA.forEach(item => {
      if ((item.entryType === 'boss' || item.type === 'Boss') && bossKC[item.order] > 0) {
        if (!item.notableDrops || item.notableDrops.length === 0) {
          if (!completedSet.has(item.order)) completedSet.add(item.order);
        }
      }
    });
    renderTable();
    updateProgress();
    updateCombatDisplay();

    statusInner.className = 'status-inner success';
    statusInner.textContent = `✓ Loaded stats for ${rsn} — ${kcUpdated} boss KC synced`;
  } catch (e) {
    statusInner.className = 'status-inner error';
    statusInner.textContent = '✗ Could not load stats. Player may not exist or Hiscores may be unavailable.';
  }
}

// ============================================================
// FILTERS & RENDERING
// ============================================================
function setFilter(f) {
  if (f === 'all') {
    activeFilters = new Set(['all']);
  } else {
    activeFilters.delete('all');
    if (activeFilters.has(f)) {
      activeFilters.delete(f);
      if (activeFilters.size === 0) activeFilters.add('all');
    } else {
      activeFilters.add(f);
    }
  }
  document.querySelectorAll('.chip[data-filter]').forEach(el => {
    el.classList.toggle('active', activeFilters.has(el.dataset.filter));
  });
  renderTable();
}

function renderTable() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const tbody = document.getElementById('main-tbody');

  // Type filters including Diary
  const typeFilters = ['Quest','Boss','Activity/Goal','Unlock','Miniquest','Diary'].filter(t => activeFilters.has(t));
  const hasLocked = activeFilters.has('locked');
  const hasAvailable = activeFilters.has('available');

  let rows = SPINE_DATA.filter(item => {
    if (activeFilters.has('all')) return true;

    let pass = false;

    // Type match
    if (typeFilters.length > 0 && typeFilters.includes(item.type)) pass = true;

    // Locked/available filters
    if (hasLocked || hasAvailable) {
      const m = meetsReqs(item);
      if (hasLocked && m === false) pass = true;
      if (hasAvailable && (m === true || m === null)) pass = true;
    }

    return pass;
  });

  if (search) {
    rows = rows.filter(item =>
      item.name.toLowerCase().includes(search) ||
      item.location.toLowerCase().includes(search) ||
      item.type.toLowerCase().includes(search)
    );
  }

  if (!showCompleted) {
    rows = rows.filter(item => !completedSet.has(item.order));
  }

  document.getElementById('results-count').textContent = `${rows.length} items`;

  const html = rows.map(item => {
    const done = completedSet.has(item.order);
    const met = meetsReqs(item);
    const hasStats = Object.keys(playerStats).length > 0 || playerQP > 0;
    const autoAchieve = hasStats && !done && isAutoAchievable(item) && met !== false;

    let reqHtml = '';
    if (item.skillReqs) {
      const reqs = parseSkillReqs(item.skillReqs);
      reqHtml = reqs.map(r => {
        const have = r.isQP ? playerQP : r.skill.toLowerCase() === 'combat' ? getCombatLevel() : (playerStats[r.skill.toLowerCase()] || 1);
        const fail = hasStats && have < r.level;
        return `<span class="${fail ? 'req-unmet' : ''}">${r.isQP ? 'QP' : r.skill} ${r.level}${r.boostable ? ' (b)' : r.unboostable ? ' (u)' : ''}</span>`;
      }).join('<br>');
    }

    const prereqHtml = item.questPrereqs
      ? item.questPrereqs.split(';').map(p => p.trim()).filter(Boolean)
          .map(p => {
            const found = SPINE_DATA.find(d => d.name.toLowerCase() === p.toLowerCase());
            const prereqDone = found && completedSet.has(found.order);
            // Show red if we can identify the prereq and it's not done
            const showUnmet = found && !prereqDone;
            return `<span class="${showUnmet ? 'req-unmet' : ''}" style="font-size:0.78rem">${p}</span>`;
          }).join('<br>')
      : '';

    const badgeClass = item.type.replace('/', '\\/');

    let tierHtml = '';
    if (item.bossTier) {
      const tierClass = item.bossTier.toLowerCase().replace(' tier','').trim();
      tierHtml = `<span class="boss-tier tier-${tierClass}">${item.bossTier}</span>`;
    }

    // Boss KC colour logic
    const hasKC = bossKC[item.order] > 0;
    let allDropsDone = false;
    let hasDrops = item.notableDrops && item.notableDrops.length > 0;
    if (hasKC && hasDrops) {
      allDropsDone = item.notableDrops.every(([dropName]) => {
        const dropKey = `${item.order}-${dropName}`;
        return !!obtainedDrops[dropKey];
      });
    }
    const rowClass = done ? 'completed'
      : (hasKC && hasDrops && allDropsDone) ? 'row-kc-complete'
      : (hasKC && hasDrops && !allDropsDone) ? 'row-kc-progress'
      : (hasKC && !hasDrops) ? 'row-kc-complete'
      : autoAchieve ? 'row-achievable'
      : (met === false && hasStats ? 'row-locked' : '');

    // Mobile compact detail line
    const mobileDetail = [];
    if (item.skillReqs) mobileDetail.push(item.skillReqs.split(';').map(s=>s.trim()).join(' · '));
    if (item.questPrereqs) mobileDetail.push('🔑 ' + item.questPrereqs.split(';').map(s=>s.trim()).join(', '));
    if (item.location) mobileDetail.push('📍 ' + item.location);
    const mobileDetailHtml = mobileDetail.length ? `<div class="card-detail">${mobileDetail.join(' &nbsp;|&nbsp; ')}</div>` : '';

    return `<tr class="${rowClass}" data-order="${item.order}" onclick="openDetail(${item.order})">
      <td>
        <div class="check-cell" onclick="event.stopPropagation(); toggleDone(${item.order})">
          <div class="check-box ${done ? 'checked' : ''}"></div>
        </div>
      </td>
      <td>${item.order}</td>
      <td class="td-name">${item.source ? `<a href="${item.source}" target="_blank" onclick="event.stopPropagation()">${item.name}</a>` : item.name}${userNotes[item.order] ? '<span class="note-indicator" title="Has notes">📝</span>' : ''}${mobileDetailHtml}</td>
      <td><span class="type-badge badge-${item.type.replace('/','\\/')}">${item.type}</span>${tierHtml}</td>
      <td class="skill-req">${reqHtml}</td>
      <td class="skill-req">${prereqHtml}</td>
      <td class="qp-badge">${item.questPoints > 0 ? item.questPoints : ''}</td>
      <td class="location-cell">${item.location}</td>
      <td class="info-cell">${item.info.length > 100 ? item.info.substring(0,100)+'…' : item.info}</td>
      <td class="drops-cell">${(item.notableDrops && item.notableDrops.length) ? item.notableDrops.slice(0,3).map(d => `<span style="font-size:0.75rem;color:var(--text-muted)">${d[0]}<span style="color:var(--stone-lighter)"> ${d[1]}</span></span>`).join('<br>') : ''}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = html || `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);font-family:'IM Fell English',serif;font-style:italic">No items match the current filters.</td></tr>`;
}

function toggleDone(order) {
  const item = SPINE_DATA.find(d => d.order === order);
  if (completedSet.has(order)) {
    completedSet.delete(order);
    if (item && item.qp > 0) {
      playerQP = Math.max(0, playerQP - item.qp);
      const qpInput = document.getElementById('qp-input');
      if (qpInput) qpInput.value = playerQP;
    }
  } else {
    completedSet.add(order);
    if (item && item.qp > 0) {
      playerQP += item.qp;
      const qpInput = document.getElementById('qp-input');
      if (qpInput) qpInput.value = playerQP;
    }
  }
  saveToStorage();
  renderTable();
  updateProgress();
}

function updateProgress() {
  const done = completedSet.size;
  const total = SPINE_DATA.length;
  const pct = Math.round((done / total) * 100);
  document.getElementById('prog-done').textContent = done;
  document.getElementById('prog-total').textContent = total;
  document.getElementById('prog-pct').textContent = pct + '%';
  document.getElementById('prog-fill').style.width = pct + '%';
}

function toggleShowCompleted() {
  showCompleted = !showCompleted;
  document.getElementById('toggle-completed-label').textContent = showCompleted ? 'Hide Completed' : 'Show Completed';
  renderTable();
}

function clearProgress() {
  if (!confirm('Clear all progress? This cannot be undone.')) return;
  completedSet.clear();
  playerQP = 0;
  saveToStorage();
  const qpInput = document.getElementById('qp-input');
  if (qpInput) qpInput.value = 0;
  renderTable();
  updateProgress();
}

// ============================================================
// DETAIL MODAL
// ============================================================
function openDetail(order) {
  const item = SPINE_DATA.find(d => d.order === order);
  if (!item) return;

  document.getElementById('detail-title').textContent = item.name;

  const badgeHtml = `<span class="type-badge badge-${item.type}">${item.type}</span>`;
  document.getElementById('detail-subtitle').innerHTML = badgeHtml +
    (item.bossTier ? ` <span class="boss-tier tier-${item.bossTier.toLowerCase().replace(' tier','').trim()}" style="margin-left:0.5rem">${item.bossTier}</span>` : '');

  const hasStats = Object.keys(playerStats).length > 0;

  const rows = [];
  rows.push(['Order', `#${item.order}`]);
  if (item.location) rows.push(['Location', item.location]);
  if (item.questPoints > 0) rows.push(['Quest Points', `<span class="qp-badge">${item.questPoints} QP</span>`]);

  // KC tracking for bosses
  if (item.type === 'Boss') {
    const currentKC = bossKC[item.order] || 0;
    rows.push(['Kill Count', `<div style="display:flex;align-items:center;gap:0.75rem">
      <input type="number" min="0" id="kc-input-${item.order}" value="${currentKC}" 
        style="background:var(--stone);border:1px solid var(--stone-lighter);border-radius:3px;color:var(--gold);font-family:'Cinzel',serif;font-size:1rem;font-weight:700;padding:0.3rem 0.6rem;width:90px;outline:none;text-align:center"
        onchange="updateKC(${item.order}, this.value)" oninput="updateKC(${item.order}, this.value)">
      <span style="font-size:0.8rem;color:var(--text-muted)">kills logged</span>
    </div>`]);
  }

  if (item.skillReqs) {
    const reqs = parseSkillReqs(item.skillReqs);
    const html = reqs.map(r => {
      const have = r.isQP ? playerQP : r.skill.toLowerCase() === 'combat' ? getCombatLevel() : r.skill.toLowerCase() === 'total level' ? getTotalLevel() : (playerStats[r.skill.toLowerCase()] || 1);
      const fail = hasStats && have < r.level;
      return `<div style="margin-bottom:0.2rem"><span class="${fail ? 'req-unmet' : ''}">
        ${r.isQP ? 'Quest Points' : r.skill} ${r.level}${r.unboostable ? ' (unboostable)' : r.boostable ? ' (boostable)' : ''}
        ${hasStats ? `<span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.3rem">[you: ${have}]</span>` : ''}
      </span></div>`;
    }).join('');
    rows.push(['Skill Reqs', html]);
  }

  if (item.questPrereqs) {
    const prereqs = item.questPrereqs.split(';').map(s => s.trim()).filter(Boolean);
    const html = prereqs.map(p => {
      const found = SPINE_DATA.find(d => d.name.toLowerCase() === p.toLowerCase());
      const done = found && completedSet.has(found.order);
      return `<div style="margin-bottom:0.2rem">${done ? '<span style="color:var(--green-light)">✓</span>' : '<span style="color:var(--text-muted)">○</span>'} ${p}</div>`;
    }).join('');
    rows.push(['Quest Prereqs', html]);
  }

  if (item.info) rows.push(['Notes', `<span style="font-family:'IM Fell English',serif;font-style:italic">${item.info}</span>`]);

  // Notable drops with ticking (cross-links to main list)
  if (item.notableDrops && item.notableDrops.length > 0) {
    const dropsHtml = item.notableDrops.map(([dropName, dropRate]) => {
      const dropKey = `${item.order}-${dropName}`;
      const mainEntry = SPINE_DATA.find(d => d.order !== item.order && d.name.toLowerCase() === dropName.toLowerCase());
      const dropDone = !!obtainedDrops[dropKey];
      return `<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.35rem;padding:0.3rem 0.5rem;background:rgba(0,0,0,0.2);border-radius:3px">
        <div class="check-box ${dropDone ? 'checked' : ''}" style="width:14px;height:14px;flex-shrink:0"
          onclick="toggleDropDone('${dropKey}', ${item.order}, ${mainEntry ? mainEntry.order : 'null'})" title="Mark obtained"></div>
        <span style="flex:1;font-size:0.83rem;color:${dropDone ? '#6fc96f' : 'var(--text-light)'}${mainEntry ? ';cursor:pointer' : ''}"
          ${mainEntry ? `onclick="closeDetailBtn(); setTimeout(()=>openDetail(${mainEntry.order}),50)"` : ''}>
          ${dropName}${mainEntry ? ' <span style="color:var(--gold-dark);font-size:0.7rem">→</span>' : ''}
        </span>
        <span style="font-size:0.73rem;color:var(--stone-lighter);white-space:nowrap">${dropRate}</span>
      </div>`;
    }).join('');
    rows.push(['Notable Drops', dropsHtml]);
  }

  rows.push(['My Notes', `<textarea id="user-note-ta" class="user-note-ta" placeholder="Add your own notes…" onblur="saveNote(${item.order}, this.value)" onclick="event.stopPropagation()">${userNotes[item.order] || ''}</textarea>`]);
  if (item.source) rows.push(['Guide', `<a href="${item.source}" target="_blank" style="color:var(--gold-light)">${item.source.replace(/https?:\/\//,'').substring(0,50)}…</a>`]);

  document.getElementById('detail-body').innerHTML = rows.map(([l,v]) =>
    `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-val">${v}</div></div>`
  ).join('');

  const done = completedSet.has(item.order);
  document.getElementById('detail-actions').innerHTML = `
    <button class="btn" onclick="toggleDone(${item.order}); closeDetailBtn()">${done ? '✗ Mark Incomplete' : '✓ Mark Complete'}</button>
    ${item.source ? `<a href="${item.source}" target="_blank"><button class="btn btn-ghost">Open Guide ↗</button></a>` : ''}
  `;

  document.getElementById('detail-overlay').classList.add('open');
}

function updateKC(order, value) {
  const kc = Math.max(0, parseInt(value) || 0);
  bossKC[order] = kc;
  saveToStorage();
}

function toggleDropDone(dropKey, sourceOrder, mainEntryOrder) {
  // Toggle the drop's own obtained state
  if (obtainedDrops[dropKey]) {
    delete obtainedDrops[dropKey];
  } else {
    obtainedDrops[dropKey] = true;
  }
  // Check if all drops for this boss are now obtained — if so, mark complete; if not, unmark
  const item = SPINE_DATA.find(d => d.order === sourceOrder);
  if (item && item.notableDrops && item.notableDrops.length > 0) {
    const allDone = item.notableDrops.every(([dropName]) => !!obtainedDrops[`${sourceOrder}-${dropName}`]);
    if (allDone) {
      completedSet.add(sourceOrder);
    } else {
      completedSet.delete(sourceOrder);
    }
  }
  saveToStorage();
  renderTable();
  updateProgress();
  // Re-open detail to refresh checkboxes
  openDetail(sourceOrder);
}

function closeDetail(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetailBtn();
}

function closeDetailBtn() {
  document.getElementById('detail-overlay').classList.remove('open');
}

// ============================================================
// RANDOMIZER
// ============================================================
function toggleRandFilter(f) {
  const el = document.querySelector(`[data-rfilter="${f}"]`);
  if (randFilters.has(f)) {
    randFilters.delete(f);
    el && el.classList.remove('active');
  } else {
    randFilters.add(f);
    el && el.classList.add('active');
  }
}

function getSpinPool() {
  return SPINE_DATA.filter(item => {
    if (!randFilters.has(item.type) && !(item.type === 'Activity/Goal' && randFilters.has('Activity/Goal'))) return false;
    if (randFilters.has('incomplete') && completedSet.has(item.order)) return false;
    if (randFilters.has('available')) {
      const met = meetsReqs(item);
      if (met === false) return false;
    }
    return true;
  });
}

async function spinRandom() {
  const pool = getSpinPool();
  if (!pool.length) {
    document.getElementById('spin-idle').style.display = 'block';
    document.getElementById('spin-result').style.display = 'none';
    document.getElementById('spin-idle').textContent = 'No items match your filters!';
    return;
  }

  // Shuffle animation
  const nameEl = document.getElementById('spin-name');
  nameEl.classList.add('spinning');

  let ticks = 0;
  const interval = setInterval(() => {
    const rand = pool[Math.floor(Math.random() * pool.length)];
    nameEl.textContent = rand.name;
    ticks++;
    if (ticks > 18) {
      clearInterval(interval);
      nameEl.classList.remove('spinning');
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      currentSpinItem = chosen;
      showSpinResult(chosen);
    }
  }, 60);
}

function showSpinResult(item) {
  document.getElementById('spin-idle').style.display = 'none';
  const result = document.getElementById('spin-result');
  result.style.display = 'block';

  document.getElementById('spin-num').textContent = `#${item.order} of ${SPINE_DATA.length}`;
  document.getElementById('spin-name').textContent = item.name;
  document.getElementById('spin-name').classList.remove('spinning');
  document.getElementById('spin-name').style.animation = 'none';
  document.getElementById('spin-name').offsetHeight; // reflow
  document.getElementById('spin-name').style.animation = '';

  document.getElementById('spin-type').innerHTML = `<span class="type-badge badge-${item.type}">${item.type}</span>` +
    (item.bossTier ? ` <span class="boss-tier tier-${item.bossTier.toLowerCase().replace(' tier','').trim()}" style="margin-left:0.5rem">${item.bossTier}</span>` : '');

  const metaItems = [];
  if (item.location) metaItems.push({ label: 'Location', val: item.location });
  if (item.skillReqs) metaItems.push({ label: 'Skill Reqs', val: item.skillReqs });
  if (item.questPrereqs) metaItems.push({ label: 'Quest Prereqs', val: item.questPrereqs });
  if (item.questPoints > 0) metaItems.push({ label: 'QP Reward', val: item.questPoints });

  document.getElementById('spin-meta').innerHTML = metaItems.map(m =>
    `<div class="spin-meta-item"><span class="spin-meta-label">${m.label}</span><span class="spin-meta-val">${m.val}</span></div>`
  ).join('');

  document.getElementById('spin-info').textContent = item.info || '';
  document.getElementById('spin-info').style.display = item.info ? 'block' : 'none';

  // Add to history
  spinHistory.unshift(item);
  if (spinHistory.length > 8) spinHistory.pop();
  renderSpinHistory();
}

function markCurrentDone() {
  if (currentSpinItem) {
    completedSet.add(currentSpinItem.order);
    saveToStorage();
    updateProgress();
  }
  spinRandom();
}

function renderSpinHistory() {
  const wrap = document.getElementById('spin-history-wrap');
  const list = document.getElementById('spin-history-list');
  if (!spinHistory.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = spinHistory.map((item, i) =>
    `<div class="history-item">
      <span class="history-num">${i === 0 ? '←' : i + 1}</span>
      <span class="history-name">${item.name}</span>
      <span class="type-badge badge-${item.type}">${item.type}</span>
      <span style="font-size:0.75rem;color:var(--stone-lighter)">#${item.order}</span>
    </div>`
  ).join('');
}

// ============================================================
// STATS PAGE
// ============================================================
function buildSkillsGrid() {
  const grid = document.getElementById('skills-grid');
  grid.innerHTML = SKILLS.map(s =>
    `<div class="skill-input-row">
      <span class="skill-name-lbl">${s.name}</span>
      <input class="skill-level-input" type="number" min="1" max="99"
        id="skill-${s.name.toLowerCase()}"
        value="${playerStats[s.name.toLowerCase()] || ''}"
        placeholder="1">
    </div>`
  ).join('');

  const qpInput = document.getElementById('qp-input');
  if (qpInput) qpInput.value = playerQP || '';
}

function syncSkillsGridFromStats() {
  SKILLS.forEach(s => {
    const el = document.getElementById(`skill-${s.name.toLowerCase()}`);
    if (el) el.value = playerStats[s.name.toLowerCase()] || '';
  });
  const qpInput = document.getElementById('qp-input');
  if (qpInput) qpInput.value = playerQP || '';
}

function saveStats() {
  SKILLS.forEach(s => {
    const el = document.getElementById(`skill-${s.name.toLowerCase()}`);
    if (el && el.value) {
      playerStats[s.name.toLowerCase()] = Math.min(99, Math.max(1, parseInt(el.value) || 1));
    }
  });
  const qpInput = document.getElementById('qp-input');
  if (qpInput) playerQP = parseInt(qpInput.value) || 0;

  // Auto-complete base level achievements
  SPINE_DATA.forEach(item => {
    if (isAutoAchievable(item) && !completedSet.has(item.order)) {
      completedSet.add(item.order);
    }
  });

  saveToStorage();
  renderTable();
  updateProgress();
  updateCombatDisplay();

  const msg = document.getElementById('stats-saved-msg');
  msg.style.display = 'inline';
  setTimeout(() => msg.style.display = 'none', 2000);
}

function updateCombatDisplay() {
  const combatEl = document.getElementById('combat-level-display');
  const totalEl = document.getElementById('total-level-display');
  if (combatEl) combatEl.textContent = Object.keys(playerStats).length > 0 ? getCombatLevel() : '—';
  if (totalEl) totalEl.textContent = Object.keys(playerStats).length > 0 ? getTotalLevel() : '—';
}

function clearStats() {
  if (!confirm('Reset all stats?')) return;
  playerStats = {};
  playerQP = 0;
  saveToStorage();
  buildSkillsGrid();
  renderTable();
}

// ============================================================
// NAV
// ============================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[onclick="showPage('${name}')"]`).classList.add('active');
  if (name === 'stats') { buildSkillsGrid(); updateCombatDisplay(); }
}

// ============================================================
// START
// ============================================================
function updateHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}
window.addEventListener('resize', updateHeaderHeight);
updateHeaderHeight();
init();
