// ============================================================
// shared.js — ProgressScape
// Shared state and functions for all standalone pages.
// Extracted from index.html. Do not edit manually — regenerate
// from source when the feature set changes.
// ============================================================

// ============================================================
// TIER DEFINITIONS
// ============================================================
const TIERS = [
  { id: 'early',  label: 'Early Game Content',  minOrder: 1,   maxOrder: 148 },
  { id: 'mid',    label: 'Mid Game Content',     minOrder: 149, maxOrder: 278 },
  { id: 'late',   label: 'Late Game Content',    minOrder: 279, maxOrder: 396 },
  { id: 'end',    label: 'End Game Content',     minOrder: 397, maxOrder: Infinity },
];

function getTierForOrder(order) {
  return TIERS.find(t => order >= t.minOrder && order <= t.maxOrder) || TIERS[TIERS.length - 1];
}

// ============================================================
// STATE
// ============================================================
let playerStats = Object.fromEntries(['attack','hitpoints','mining','strength','agility','smithing','defence','herblore','fishing','ranged','thieving','cooking','prayer','crafting','firemaking','magic','fletching','woodcutting','runecraft','slayer','farming','construction','hunter','sailing'].map(s => [s, 1]));
let playerQP = 0;
let completedSet = new Set();
let activeFilters = new Set(['all']);
let showCompleted = true;
let randFilters = new Set(['Quest','Boss','Activity/Goal','Unlock','Miniquest','Diary','incomplete']);
let bossKC = {};
let obtainedDrops = {};
let spinHistory = [];
let currentSpinItem = null;

// Combat Oracle state
var caFilters = new Set(['Easy','Medium','Hard','Elite','Master','Grandmaster','ca-incomplete']);
var currentCombatItem = null;
var combatHistory = [];

// Collection Oracle state
var clogOracleFilters = new Set(['Bosses','Raids','Clues','Minigames','Other','clog-missing']);
var currentClogOracleItem = null;
var clogOracleHistory = [];
let userNotes = {};
let ironmanMode = false;
// Track which accordion tiers are open (by tier id)
let openTiers = new Set();
let planMode = 'custom'; // tracks current planner modal mode

const SKILLS = [
  {name:'Attack',       icon:'https://oldschool.runescape.wiki/images/Attack_icon.png'},
  {name:'Hitpoints',    icon:'https://oldschool.runescape.wiki/images/Hitpoints_icon.png'},
  {name:'Mining',       icon:'https://oldschool.runescape.wiki/images/Mining_icon.png'},
  {name:'Strength',     icon:'https://oldschool.runescape.wiki/images/Strength_icon.png'},
  {name:'Agility',      icon:'https://oldschool.runescape.wiki/images/Agility_icon.png'},
  {name:'Smithing',     icon:'https://oldschool.runescape.wiki/images/Smithing_icon.png'},
  {name:'Defence',      icon:'https://oldschool.runescape.wiki/images/Defence_icon.png'},
  {name:'Herblore',     icon:'https://oldschool.runescape.wiki/images/Herblore_icon.png'},
  {name:'Fishing',      icon:'https://oldschool.runescape.wiki/images/Fishing_icon.png'},
  {name:'Ranged',       icon:'https://oldschool.runescape.wiki/images/Ranged_icon.png'},
  {name:'Thieving',     icon:'https://oldschool.runescape.wiki/images/Thieving_icon.png'},
  {name:'Cooking',      icon:'https://oldschool.runescape.wiki/images/Cooking_icon.png'},
  {name:'Prayer',       icon:'https://oldschool.runescape.wiki/images/Prayer_icon.png'},
  {name:'Crafting',     icon:'https://oldschool.runescape.wiki/images/Crafting_icon.png'},
  {name:'Firemaking',   icon:'https://oldschool.runescape.wiki/images/Firemaking_icon.png'},
  {name:'Magic',        icon:'https://oldschool.runescape.wiki/images/Magic_icon.png'},
  {name:'Fletching',    icon:'https://oldschool.runescape.wiki/images/Fletching_icon.png'},
  {name:'Woodcutting',  icon:'https://oldschool.runescape.wiki/images/Woodcutting_icon.png'},
  {name:'Runecraft',    icon:'https://oldschool.runescape.wiki/images/Runecraft_icon.png'},
  {name:'Slayer',       icon:'https://oldschool.runescape.wiki/images/Slayer_icon.png'},
  {name:'Farming',      icon:'https://oldschool.runescape.wiki/images/Farming_icon.png'},
  {name:'Construction', icon:'https://oldschool.runescape.wiki/images/Construction_icon.png'},
  {name:'Hunter',       icon:'https://oldschool.runescape.wiki/images/Hunter_icon.png'},
  {name:'Sailing',      icon:'https://oldschool.runescape.wiki/images/Sailing_icon.png'},
];

const TYPE_ICONS = {
  'Quest':         'https://oldschool.runescape.wiki/images/Quest_point_icon.png',
  'Boss':          'https://oldschool.runescape.wiki/images/Skull_icon.png',
  'Activity/Goal': 'https://oldschool.runescape.wiki/images/Minigame_map_icon.png',
  'Unlock':        'https://oldschool.runescape.wiki/images/Member_icon.png',
  'Miniquest':     'https://oldschool.runescape.wiki/images/Miniquest_icon.png',
  'Diary':         'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',
};

// ============================================================
// INIT
// ============================================================
function recalcQPFromCompleted() {
  // Recompute playerQP by summing qp values of all completed items.
  // Fixes drift when quests were bulk-imported or RSN-synced without
  // the per-toggle QP increment running.
  let total = 0;
  completedSet.forEach(order => {
    const item = SPINE_DATA.find(d => d.order === order);
    if (item && item.qp > 0) total += item.qp;
  });
  playerQP = total;
  const qpInput = document.getElementById('qp-input');
  if (qpInput) qpInput.value = playerQP || '';
  saveToStorage();
}

function init() {
  loadFromStorage();
  recalcQPFromCompleted();
  buildSkillsGrid();
  autoDetectOpenTier();
  renderTable();
  updateProgress();
  updateCombatDisplay();
  renderFloatingHistory();
  setTimeout(updateHeaderHeight, 50);
  loadPlan();
  renderPlanner();
  loadFilterFromURL();
  fetchGEPrices(); // non-blocking — fires and forgets, page works fine if it fails
}

// ============================================================
// GE PRICE LAYER
// ============================================================

// Populated by fetchGEPrices(). Keyed by numeric item ID.
// { 12922: { high: 1234567, low: 1200000 }, ... }
window.GE_PRICES = null; // null = not yet fetched; {} = fetched but empty (error)

// Collect every item ID referenced in SPINE_DATA notableDrops at runtime.
// Returns a sorted array of unique positive integers.
function collectSpineItemIds() {
  var ids = new Set();
  SPINE_DATA.forEach(function(item) {
    (item.notableDrops || []).forEach(function(drop) {
      if (drop.length > 2 && typeof drop[2] === 'number' && drop[2] > 0) {
        ids.add(drop[2]);
      }
    });
  });
  return Array.from(ids).sort(function(a, b) { return a - b; });
}

async function fetchGEPrices() {
  try {
    var ids = collectSpineItemIds();
    if (!ids.length) { window.GE_PRICES = {}; return; }

    var url = 'https://prices.runescape.wiki/api/v1/latest?id=' + ids.join(',');
    var resp = await fetch(url, {
      headers: {
        // Wiki API requires a User-Agent identifying the app
        'User-Agent': 'ProgressScape/1.0 (progressscape.net; progression tracker)'
      }
    });
    if (!resp.ok) { window.GE_PRICES = {}; return; }

    var json = await resp.json();
    // Response: { "data": { "<itemId>": { "high": int, "highTime": int, "low": int, "lowTime": int } } }
    window.GE_PRICES = json.data || {};

    // Prices just arrived — refresh any surfaces already visible
    // Boss tracker: full re-render (cards need price injected)
    var bossPage = document.getElementById('page-bosses');
    if (bossPage && bossPage.classList.contains('active')) {
      renderBossTracker();
    }
    // Detail modal: re-open same item so drop rows get prices
    var detailOverlay = document.getElementById('detail-overlay');
    if (detailOverlay && detailOverlay.classList.contains('open')) {
      var titleEl = document.getElementById('detail-title');
      if (titleEl) {
        var currentItem = SPINE_DATA.find(function(d) { return d.name === titleEl.textContent; });
        if (currentItem) openDetail(currentItem.order);
      }
    }
  } catch (e) {
    // Network failure, CORS block, malformed JSON — silently degrade
    window.GE_PRICES = {};
  }
}

// Returns a formatted price string for an item ID, or null if unavailable.
// Uses the 'high' (instant buy) price — what a player would pay.
// fmt: 'full' = "1,234,567 gp"  |  'short' = "1.2M" / "234K" / "5,432 gp"
function gePrice(itemId, fmt) {
  if (!window.GE_PRICES || !itemId) return null;
  var entry = window.GE_PRICES[String(itemId)];
  if (!entry || !entry.high) return null;
  var gp = entry.high;
  if (fmt === 'short') {
    if (gp >= 1000000) return (gp / 1000000).toFixed(gp >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (gp >= 1000)    return (gp / 1000).toFixed(gp >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return gp.toLocaleString() + ' gp';
  }
  return gp.toLocaleString() + ' gp';
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
    const sh = localStorage.getItem('osrs_spine_spinhistory');
    if (sh) spinHistory = JSON.parse(sh);
    const im = localStorage.getItem('osrs_spine_ironman');
    if (im) ironmanMode = JSON.parse(im);
    const ot = localStorage.getItem('osrs_spine_opentiers');
    if (ot) openTiers = new Set(JSON.parse(ot));
  } catch(e) {}
}

function saveToStorage() {
  localStorage.setItem('osrs_spine_stats', JSON.stringify(playerStats));
  localStorage.setItem('osrs_spine_qp', playerQP);
  localStorage.setItem('osrs_spine_completed', JSON.stringify([...completedSet]));
  localStorage.setItem('osrs_spine_notes', JSON.stringify(userNotes));
  localStorage.setItem('osrs_spine_kc', JSON.stringify(bossKC));
  localStorage.setItem('osrs_spine_drops', JSON.stringify(obtainedDrops));
  localStorage.setItem('osrs_spine_spinhistory', JSON.stringify(spinHistory));
  localStorage.setItem('osrs_spine_ironman', JSON.stringify(ironmanMode));
  localStorage.setItem('osrs_spine_opentiers', JSON.stringify([...openTiers]));
}

function saveNote(order, text) {
  if (text.trim()) {
    userNotes[order] = text;
  } else {
    delete userNotes[order];
  }
  localStorage.setItem('osrs_spine_notes', JSON.stringify(userNotes));
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
// IRONMAN TOGGLE
// ============================================================
function toggleIronman() {
  ironmanMode = !ironmanMode;
  const btn = document.getElementById('ironman-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', ironmanMode);
    btn.title = ironmanMode ? 'Ironman Mode: ON' : 'Ironman Mode: OFF';
  }
  saveToStorage();
  autoDetectOpenTier();
  renderTable();
}

function getActiveData() {
  if (!ironmanMode) return SPINE_DATA;
  // Build ordered list using IRONMAN_DATA
  const nameToSpine = {};
  SPINE_DATA.forEach(e => { nameToSpine[e.name] = e; });
  const seen = new Set();
  const result = [];
  IRONMAN_DATA.forEach((imEntry, idx) => {
    const spine = nameToSpine[imEntry.name];
    if (!spine) return;
    const key = `${imEntry.name}-${imEntry.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ...spine, imOrder: imEntry.imOrder, imType: imEntry.type, _spineOrder: spine.order, order: idx + 1 });
  });
  return result;
}

// ============================================================
// AUTO-DETECT OPEN TIER
// ============================================================
function autoDetectOpenTier() {
  // If user has manually set openTiers, keep them unless empty
  if (openTiers.size > 0) return;

  const data = getActiveData();
  // Find first tier that isn't 100% complete
  for (const tier of TIERS) {
    const tierItems = data.filter(item => {
      const order = ironmanMode ? item.imOrder || item.order : item.order;
      return order >= tier.minOrder && order <= tier.maxOrder;
    });
    if (tierItems.length === 0) continue;
    const allDone = tierItems.every(item => completedSet.has(SPINE_DATA.find(s=>s.name===item.name)?.order || item.order));
    if (!allDone) {
      openTiers.add(tier.id);
      return;
    }
  }
  // All done — open end game
  openTiers.add('end');
}

function toggleTier(tierId) {
  if (openTiers.has(tierId)) {
    openTiers.delete(tierId);
  } else {
    openTiers.add(tierId);
  }
  saveToStorage();
  renderTable();
  setTimeout(updateTierFloat, 20);
}

// ============================================================
// SKILL REQUIREMENTS PARSING
// ============================================================
function parseSkillReqs(reqStr) {
  if (!reqStr) return [];
  const results = [];
  const parts = reqStr.split(';').map(s => s.trim());
  for (const part of parts) {
    const m = part.match(/^(.+?)\s+(\d+)(\s*\(.*?\))?$/);
    if (m) {
      // Normalise "Combat level" -> "combat", "Total level" -> "total level"
      let skillName = m[1].trim();
      if (/^combat\s+level$/i.test(skillName)) skillName = 'combat';
      else if (/^total\s+level$/i.test(skillName)) skillName = 'total level';
      results.push({
        skill: skillName,
        level: parseInt(m[2]),
        note: m[3] ? m[3].trim() : '',
        boostable: part.toLowerCase().includes('boostable') && !part.toLowerCase().includes('unboostable'),
        unboostable: part.toLowerCase().includes('unboostable'),
        isQP: skillName.toLowerCase().includes('quest point')
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
  // Sum all 24 skills; any not entered yet default to 1 (same as OSRS hiscores behaviour)
  return SKILLS.reduce((sum, s) => sum + (playerStats[s.name.toLowerCase()] || 1), 0);
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
      if (getCombatLevel() < req.level) return false;
    } else if (req.skill.toLowerCase() === 'total level' || req.skill.toLowerCase() === 'total') {
      if (!hasSkillStats) continue;
      if (getTotalLevel() < req.level) return false;
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

function isAutoAchievable(item) {
  if (item.type !== 'Activity/Goal') return false;
  // Base tasks now use explicit per-skill reqs — detect by name and use meetsReqs
  if (/^Base \d+$/.test(item.name)) {
    if (Object.keys(playerStats).length === 0) return false;
    return meetsReqs(item) === true;
  }
  return false;
}

// Check if item is within ±10 of player's skill levels (for Suggest Task)
function isAchievableNear(item) {
  const reqs = parseSkillReqs(item.skillReqs);
  if (!reqs.length) return meetsReqs(item) !== false;
  const hasStats = Object.keys(playerStats).length > 0;
  if (!hasStats) return false;
  let hasAnySkillReq = false;
  for (const req of reqs) {
    if (req.isQP || req.skill.toLowerCase() === 'combat' || req.skill.toLowerCase() === 'total') continue;
    hasAnySkillReq = true;
    const have = playerStats[req.skill.toLowerCase()] || 1;
    if (have < req.level) {
      if (req.level - have > 10) return false; // more than 10 levels away
    }
  }
  // Also must not fail QP or quest prereqs
  if (item.questPrereqs) {
    const prereqs = item.questPrereqs.split(';').map(s=>s.trim()).filter(Boolean);
    for (const prereq of prereqs) {
      const found = SPINE_DATA.find(d => d.name.toLowerCase() === prereq.toLowerCase());
      if (found && !completedSet.has(found.order)) return false;
    }
  }
  return true;
}

// ============================================================
// RSN LOOKUP
// ============================================================

// ── ProgressScape Plugin ─────────────────────────────────────
// When the RuneLite plugin is approved and its endpoint is known,
// replace PROGRESSSCAPE_PLUGIN_URL with the real address, e.g.:
//   'http://localhost:8080/progressscape'
// The plugin should return JSON with at least:
//   { kc: { [bossName]: number }, completions: [bossName, ...] }
// Leave as null to disable the plugin override entirely.
const PROGRESSSCAPE_PLUGIN_URL = null; // TODO: set when plugin endpoint is confirmed
const PROGRESSSCAPE_TIMEOUT_MS = 1000; // fast fail so first-time users aren't blocked

async function fetchPluginData(rsn) {
  if (!PROGRESSSCAPE_PLUGIN_URL) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROGRESSSCAPE_TIMEOUT_MS);
    const resp = await fetch(
      `${PROGRESSSCAPE_PLUGIN_URL}?rsn=${encodeURIComponent(rsn)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null; // timeout, CORS, plugin not running — silently fall back
  }
}

async function lookupRSNFromStats() {
  await lookupRSN('rsn-input-stats', 'lookup-status-stats', 'lookup-status-stats-inner');
}

async function lookupRSN(inputId, statusDivId, statusInnerId) {
  inputId = inputId || 'rsn-input';
  statusDivId = statusDivId || 'lookup-status';
  statusInnerId = statusInnerId || 'lookup-status-inner';
  const rsn = document.getElementById(inputId).value.trim();
  if (!rsn) return;
  const statusDiv = document.getElementById(statusDivId);
  const statusInner = document.getElementById(statusInnerId);
  statusDiv.style.display = 'block';
  statusInner.className = 'status-inner';
  statusInner.textContent = '⏳ Looking up ' + rsn + '…';
  try {
    // ── Step 1: Hiscores (always runs, baseline for all users) ──
    const hiscoresUrl = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(rsn)}`;
    const proxies = [
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(hiscoresUrl)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(hiscoresUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(hiscoresUrl)}`
    ];
    let data = null;
    for (const proxyUrl of proxies) {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) continue;
        const parsed = await resp.json();
        if (parsed && (parsed.skills || parsed.activities)) { data = parsed; break; }
      } catch { /* try next */ }
    }
    if (!data) throw new Error('Player not found');
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
    const spineNameMap = {};
    SPINE_DATA.forEach(item => {
      if (item.entryType === 'boss' || item.type === 'Boss') {
        const norm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        spineNameMap[norm] = item.order;
      }
    });
    let kcUpdated = 0;
    (data.activities || []).forEach(activity => {
      const kc = activity.score;
      if (!kc || kc < 1) return;
      const norm = activity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (spineNameMap[norm] !== undefined) { bossKC[spineNameMap[norm]] = kc; kcUpdated++; return; }
      for (const [spineName, order] of Object.entries(spineNameMap)) {
        if (norm.includes(spineName) || spineName.includes(norm)) { bossKC[order] = kc; kcUpdated++; break; }
      }
    });

    // ── Step 2: ProgressScape plugin override (if available) ───
    // Runs concurrently with the render prep above; fails silently
    // if the plugin isn't installed or the user doesn't have it.
    let pluginSource = false;
    const pluginData = await fetchPluginData(rsn);
    if (pluginData) {
      // Override KC with plugin values (more accurate than hiscores)
      if (pluginData.kc && typeof pluginData.kc === 'object') {
        Object.entries(pluginData.kc).forEach(([bossName, kc]) => {
          const norm = bossName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (spineNameMap[norm] !== undefined) {
            bossKC[spineNameMap[norm]] = kc;
          } else {
            for (const [spineName, order] of Object.entries(spineNameMap)) {
              if (norm.includes(spineName) || spineName.includes(norm)) {
                bossKC[order] = kc; break;
              }
            }
          }
        });
        kcUpdated = Object.keys(pluginData.kc).length;
      }
      // Mark completions tracked by the plugin
      if (Array.isArray(pluginData.completions)) {
        pluginData.completions.forEach(bossName => {
          const norm = bossName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (spineNameMap[norm] !== undefined) completedSet.add(spineNameMap[norm]);
        });
      }
      pluginSource = true;
    }

    // ── Step 3: Finalise & render ───────────────────────────────
    saveToStorage();
    syncSkillsGridFromStats();
    SPINE_DATA.forEach(item => {
      if (isAutoAchievable(item) && !completedSet.has(item.order)) completedSet.add(item.order);
    });
    SPINE_DATA.forEach(item => {
      if ((item.entryType === 'boss' || item.type === 'Boss') && bossKC[item.order] > 0) {
        if (!item.notableDrops || item.notableDrops.length === 0) {
          if (!completedSet.has(item.order)) completedSet.add(item.order);
        }
      }
    });
    autoDetectOpenTier();
    renderTable();
    updateProgress();
    updateCombatDisplay();
    statusInner.className = 'status-inner success';
    if (pluginSource) {
      statusInner.textContent = `✓ Loaded stats for ${rsn} — ${kcUpdated} boss KC synced via ProgressScape plugin`;
    } else {
      statusInner.textContent = `✓ Loaded stats for ${rsn} — ${kcUpdated} boss KC synced from Hiscores`;
    }
  } catch (e) {
    statusInner.className = 'status-inner error';
    statusInner.textContent = '✗ Could not load stats. Player may not exist or Hiscores may be unavailable.';
  }
}

// ============================================================
// FILTERS & RENDERING
// ============================================================
function setFilter(f, silent) {
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
  if (!silent) pushFilterState();
}

function renderTable() {
  const searchEl = document.getElementById('search-input');
  if (!searchEl) return;
  const search = searchEl.value.toLowerCase();
  const tbody = document.getElementById('main-tbody');
  const data = getActiveData();

  const typeFilters = ['Quest','Boss','Activity/Goal','Unlock','Miniquest','Diary'].filter(t => activeFilters.has(t));
  const hasLocked = activeFilters.has('locked');
  const hasAvailable = activeFilters.has('available');
  const isFiltered = !activeFilters.has('all') || search || !showCompleted;

  let filteredData = data.filter(item => {
    if (activeFilters.has('all')) return true;
    let pass = false;
    if (typeFilters.length > 0 && typeFilters.includes(item.type)) pass = true;
    if (hasLocked || hasAvailable) {
      const m = meetsReqs(item);
      if (hasLocked && m === false) pass = true;
      if (hasAvailable && (m === true || m === null)) pass = true;
    }
    return pass;
  });

  if (search) {
    filteredData = filteredData.filter(item =>
      item.name.toLowerCase().includes(search) ||
      item.location.toLowerCase().includes(search) ||
      item.type.toLowerCase().includes(search)
    );
  }

  if (!showCompleted) {
    filteredData = filteredData.filter(item => !completedSet.has(item.order));
  }

  document.getElementById('results-count').textContent = `${filteredData.length} items`;

  let html = '';
  const noResultsMsg = (isFiltered && (search || !activeFilters.has('all') || !showCompleted))
    ? `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted);font-family:'IM Fell English',serif;font-style:italic">No items match the current filters.</td></tr>`
    : `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">No items found.</td></tr>`;

  for (const tier of TIERS) {
    const tierItems = filteredData.filter(item => {
      const ord = ironmanMode ? (item.imOrder || item.order) : item.order;
      return ord >= tier.minOrder && ord <= tier.maxOrder;
    });
    if (tierItems.length === 0) continue;
    const tierDone = tierItems.filter(item => completedSet.has(item.order)).length;
    const tierTotal = tierItems.length;
    const tierPct = Math.round((tierDone / tierTotal) * 100);
    const allComplete = tierDone === tierTotal;
    const isOpen = openTiers.has(tier.id);
    html += buildTierHeaderHtml(tier, tierDone, tierTotal, tierPct, allComplete, isOpen);
    if (isOpen) html += tierItems.map(item => buildRowHtml(item)).join('');
  }

  tbody.innerHTML = html || noResultsMsg;
  updateHeaderHeight();
  updateTierFloat();
}

function buildTierHeaderHtml(tier, tierDone, tierTotal, tierPct, allComplete, isOpen) {
  return `<tr class="tier-header-row ${allComplete ? 'tier-complete' : ''}" data-tier="${tier.id}" onclick="toggleTier('${tier.id}')">
    <td colspan="10">
      <div class="tier-header-inner">
        <div class="tier-header-left">
          <span class="tier-chevron ${isOpen ? 'open' : ''}">${isOpen ? '▼' : '▶'}</span>
          <span class="tier-label">${tier.label}</span>
          ${allComplete ? '<span class="tier-done-badge">✓ Complete</span>' : ''}
        </div>
        <div class="tier-header-right">
          <div class="tier-progress-wrap">
            <div class="tier-progress-bar" style="width:${tierPct}%"></div>
          </div>
          <span class="tier-count">${tierDone}/${tierTotal}</span>
          <button class="tier-mark-all ${allComplete ? 'tier-all-done' : ''}" onclick="markTierDone('${tier.id}', event)">${allComplete ? '✓ All Done' : 'Mark All'}</button>
        </div>
      </div>
    </td>
  </tr>`;
}

function buildRowHtml(item) {
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
          return `<span class="${found && !prereqDone ? 'req-unmet' : ''}" style="font-size:0.78rem">${p}</span>`;
        }).join('<br>')
    : '';

  let tierHtml = '';
  if (item.bossTier) {
    const tierClass = item.bossTier.toLowerCase().replace(' tier','').trim();
    tierHtml = `<span class="boss-tier tier-${tierClass}">${item.bossTier}</span>`;
  }

  // Ironman type badge
  let imBadge = '';
  if (ironmanMode && item.imType && item.imType !== 'direct') {
    const imLabels = { partial: '⚡ Partial', unlock: '🔓 Unlock', unlock_teleport: '🔓 Teleport' };
    imBadge = `<span class="im-badge">${imLabels[item.imType] || item.imType}</span>`;
  }

  const hasKC = bossKC[item.order] > 0;
  let allDropsDone = false;
  let hasDrops = item.notableDrops && item.notableDrops.length > 0;
  if (hasKC && hasDrops) {
    allDropsDone = item.notableDrops.every(([dropName]) => !!obtainedDrops[`${item.order}-${dropName}`]);
  }
  const rowClass = done ? 'completed'
    : (hasKC && hasDrops && allDropsDone) ? 'row-kc-complete'
    : (hasKC && hasDrops && !allDropsDone) ? 'row-kc-progress'
    : (hasKC && !hasDrops) ? 'row-kc-complete'
    : autoAchieve ? 'row-achievable'
    : (met === false && hasStats ? 'row-locked' : '');

  const mobileDetail = [];
  if (item.location) {
    mobileDetail.push('📍 ' + item.location);
  } else if (item.skillReqs) {
    mobileDetail.push(item.skillReqs.split(';').map(s=>s.trim()).join(' · '));
  }
  const mobileDetailHtml = mobileDetail.length ? `<div class="card-detail">${mobileDetail.join('')}</div>` : '';

  const displayOrder = ironmanMode ? (item.imOrder || item.order) : item.order;

  const detailOrder = item._spineOrder || item.order;
  return `<tr class="${rowClass}" data-order="${detailOrder}" onclick="openDetail(${detailOrder})">
    <td>
      <div class="check-cell" onclick="event.stopPropagation(); toggleDone(${item.order})">
        <div class="check-box ${done ? 'checked' : ''}"></div>
      </div>
    </td>
    <td>${displayOrder}</td>
    <td class="td-name">${item.source ? `<a href="${item.source}" target="_blank" onclick="event.stopPropagation()">${item.name}</a>` : item.name}${imBadge}${userNotes[item.order] ? '<span class="note-indicator" title="Has notes">📝</span>' : ''}${mobileDetailHtml}</td>
    <td><span class="type-badge badge-${item.type.replace('/','\\/')}">${TYPE_ICONS[item.type] ? `<img src="${TYPE_ICONS[item.type]}" alt="" style="width:12px;height:12px;object-fit:contain;vertical-align:middle;margin-right:3px;opacity:0.85">` : ''} ${item.type}</span>${tierHtml}</td>
    <td class="skill-req">${reqHtml}</td>
    <td class="skill-req">${prereqHtml}</td>
    <td class="qp-badge">${item.qp > 0 ? item.qp : ''}</td>
    <td class="location-cell">${item.location}</td>
    <td class="info-cell">${item.info.length > 100 ? item.info.substring(0,100)+'…' : item.info}</td>
    <td class="drops-cell">${(item.notableDrops && item.notableDrops.length) ? item.notableDrops.slice(0,3).map(d => `<span style="font-size:0.75rem;color:var(--text-muted)">${d[0]}<span style="color:var(--stone-lighter)"> ${d[1]}</span></span>`).join('<br>') : ''}</td>
  </tr>`;
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

function markTierDone(tierId, e) {
  e.stopPropagation();
  var tier = TIERS.find(function(t) { return t.id === tierId; });
  if (!tier) return;
  var data = getActiveData();

  // Start with all items in this tier
  var tierItems = data.filter(function(item) {
    var ord = ironmanMode ? (item.imOrder || item.order) : item.order;
    return ord >= tier.minOrder && ord <= tier.maxOrder;
  });

  // Apply active type filters — only mark what's currently visible
  var typeFilters = ['Quest','Boss','Activity/Goal','Unlock','Miniquest','Diary'].filter(function(t) { return activeFilters.has(t); });
  var hasLocked = activeFilters.has('locked');
  var hasAvailable = activeFilters.has('available');
  if (!activeFilters.has('all')) {
    tierItems = tierItems.filter(function(item) {
      var pass = false;
      if (typeFilters.length > 0 && typeFilters.includes(item.type)) pass = true;
      if (hasLocked || hasAvailable) {
        var m = meetsReqs(item);
        if (hasLocked && m === false) pass = true;
        if (hasAvailable && (m === true || m === null)) pass = true;
      }
      return pass;
    });
  }

  // Apply search filter
  var search = (document.getElementById('search-input') || {}).value || '';
  search = search.toLowerCase().trim();
  if (search) {
    tierItems = tierItems.filter(function(item) {
      return item.name.toLowerCase().includes(search) ||
             item.location.toLowerCase().includes(search) ||
             item.type.toLowerCase().includes(search);
    });
  }

  var allDone = tierItems.every(function(item) { return completedSet.has(item.order); });
  tierItems.forEach(function(item) {
    if (allDone) { completedSet.delete(item.order); }
    else { completedSet.add(item.order); }
  });
  recalcQPFromCompleted();
  saveToStorage();
  renderTable();
  updateProgress();
}

function updateProgress() {
  const progDone = document.getElementById('prog-done');
  if (!progDone) return;
  const done = completedSet.size;
  const total = SPINE_DATA.length;
  const pct = Math.round((done / total) * 100);
  progDone.textContent = done;
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
  openTiers.clear();
  autoDetectOpenTier();
  try { localStorage.removeItem('osrs_spine_badges_seen'); } catch(e) {}
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
  const badgeHtml = `<span class="type-badge badge-${item.type}">${TYPE_ICONS[item.type] ? '<img src="' + TYPE_ICONS[item.type] + '" alt="" style="width:12px;height:12px;object-fit:contain;vertical-align:middle;margin-right:3px;opacity:0.85">' : ''} ${item.type}</span>`;
  document.getElementById('detail-subtitle').innerHTML = badgeHtml +
    (item.bossTier ? ` <span class="boss-tier tier-${item.bossTier.toLowerCase().replace(' tier','').trim()}" style="margin-left:0.5rem">${item.bossTier}</span>` : '');
  const hasStats = Object.keys(playerStats).length > 0;
  const rows = [];
  rows.push(['Order', `#${item.order}`]);
  if (item.location) rows.push(['Location', item.location]);
  if (item.qp > 0) rows.push(['Quest Points', `<span class="qp-badge">${item.qp} QP</span>`]);
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
  if (item.notableDrops && item.notableDrops.length > 0) {
    const dropsHtml = item.notableDrops.map(([dropName, dropRate, itemId]) => {
      const dropKey = `${item.order}-${dropName}`;
      const mainEntry = SPINE_DATA.find(d => d.order !== item.order && d.name.toLowerCase() === dropName.toLowerCase());
      const dropDone = !!obtainedDrops[dropKey];
      const price = gePrice(itemId, 'short');
      const priceHtml = price
        ? `<span style="font-size:0.72rem;color:var(--gold-dark);white-space:nowrap;margin-left:0.25rem" title="GE price (instant buy)">${price}</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.35rem;padding:0.3rem 0.5rem;background:rgba(0,0,0,0.2);border-radius:3px">
        <div class="check-box ${dropDone ? 'checked' : ''}" style="width:14px;height:14px;flex-shrink:0"
          onclick="toggleDropDone('${dropKey}', ${item.order}, ${mainEntry ? mainEntry.order : 'null'})" title="Mark obtained"></div>
        <span style="flex:1;font-size:0.83rem;color:${dropDone ? '#6fc96f' : 'var(--text-light)'}${mainEntry ? ';cursor:pointer' : ''}"
          ${mainEntry ? `onclick="closeDetailBtn(); setTimeout(()=>openDetail(${mainEntry.order}),50)"` : ''}>
          ${dropName}${mainEntry ? ' <span style="color:var(--gold-dark);font-size:0.7rem">→</span>' : ''}
        </span>
        <span style="font-size:0.73rem;color:var(--stone-lighter);white-space:nowrap">${dropRate}</span>
        ${priceHtml}
      </div>`;
    }).join('');
    rows.push(['Notable Drops', dropsHtml]);
  }
  // Combat Achievements section in modal
  if (item.type === 'Boss' || item.entryType === 'boss') {
    var caTasks = getCaTasksForBoss(item.name);
    if (caTasks.length > 0) {
      var caTotal = caTasks.length;
      var caDone = caTasks.filter(function(t) { return caCompleted[t.id]; }).length;
      var caPct = caTotal > 0 ? Math.round(caDone / caTotal * 100) : 0;
      var caTasksHtml = caTasks.map(function(t) {
        var done = !!caCompleted[t.id];
        var tierKey = t.tier === 'Grandmaster' ? 'gm' : t.tier.toLowerCase();
        return '<div class="detail-ca-task" onclick="toggleCaTask(\'' + t.id + '\')">' +
          '<div class="detail-ca-task-check' + (done ? ' done' : '') + '">' + (done ? '✓' : '') + '</div>' +
          '<span class="detail-ca-task-name' + (done ? ' done' : '') + '">' + t.name + '</span>' +
          '<span class="detail-ca-task-tier ' + tierKey + '">' + t.tier + '</span>' +
        '</div>';
      }).join('');
      var caHtml = '<div class="detail-ca-section">' +
        '<div class="detail-ca-header">' +
          '<div class="detail-ca-bar"><div class="detail-ca-bar-fill" style="width:' + caPct + '%"></div></div>' +
          '<span class="detail-ca-frac">' + caDone + ' / ' + caTotal + ' tasks</span>' +
          '<button class="detail-ca-link" onclick="closeDetailBtn();setCaBossFilter(\'' + item.name + '\');showPage(\'combat\');event.stopPropagation()">↗ View all CAs</button>' +
        '</div>' +
        caTasksHtml +
      '</div>';
      rows.push(['Combat Tasks', caHtml]);
    }
  }
  rows.push(['My Notes', `<textarea id="user-note-ta" class="user-note-ta" placeholder="Add your own notes…" onblur="saveNote(${item.order}, this.value)" onclick="event.stopPropagation()">${userNotes[item.order] || ''}</textarea>`]);
  if (item.source) rows.push(['Guide', `<a href="${item.source}" target="_blank" style="color:var(--gold-light)">${item.source.replace(/https?:\/\//,'').substring(0,50)}…</a>`]);
  document.getElementById('detail-body').innerHTML = rows.map(([l,v]) =>
    `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-val">${v}</div></div>`
  ).join('');
  const done = completedSet.has(item.order);
  document.getElementById('detail-actions').innerHTML = `
    <button class="btn" onclick="toggleDone(${item.order}); closeDetailBtn()">${done ? '✗ Mark Incomplete' : '✓ Mark Complete'}</button>
    <button class="btn btn-ghost" onclick="buildPathTo(${item.order})" title="Recursively find all incomplete prerequisites and add them to Custom Path" style="border-color:#4a7fc8;color:#8abcf8">🗺 Build Path</button>
    <button class="btn btn-ghost" onclick="showDownstreamTree(${item.order})" title="See what completing this opens up" style="border-color:rgba(200,168,75,0.35);color:var(--gold-dark)">⚔ Opens The Way</button>
    ${item.source ? `<a href="${item.source}" target="_blank"><button class="btn btn-ghost">Open Guide ↗</button></a>` : ''}
  `;
  document.getElementById('detail-overlay').classList.add('open');
}

function updateKC(order, value) {
  bossKC[order] = Math.max(0, parseInt(value) || 0);
  saveToStorage();
}

function toggleDropDone(dropKey, sourceOrder, mainEntryOrder) {
  if (obtainedDrops[dropKey]) {
    delete obtainedDrops[dropKey];
  } else {
    obtainedDrops[dropKey] = true;
  }
  const item = SPINE_DATA.find(d => d.order === sourceOrder);
  if (item && item.notableDrops && item.notableDrops.length > 0) {
    const allDone = item.notableDrops.every(([dropName]) => !!obtainedDrops[`${sourceOrder}-${dropName}`]);
    if (allDone) completedSet.add(sourceOrder);
    else completedSet.delete(sourceOrder);
  }
  saveToStorage();
  renderTable();
  updateProgress();
  // Refresh whichever surface triggered the toggle
  const bossPage = document.getElementById('page-bosses');
  if (bossPage && bossPage.classList.contains('active')) {
    refreshBossCard(sourceOrder);
  } else {
    openDetail(sourceOrder);
  }
}

function closeDetail(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetailBtn();
}

function closeDetailBtn() {
  document.getElementById('detail-overlay').classList.remove('open');
}

// ============================================================
// BUILD PATH TO GOAL
// ============================================================
function buildPathTo(goalOrder) {
  const goalItem = SPINE_DATA.find(d => d.order === goalOrder);
  if (!goalItem) return;

  // ── Step 1: Recursively collect all incomplete spine items ──
  const visited = new Set();
  const needed = []; // spine orders in dependency-first order

  function collect(order) {
    if (visited.has(order)) return;
    visited.add(order);
    const item = SPINE_DATA.find(d => d.order === order);
    if (!item) return;
    // Recurse quest prereqs depth-first so deps come before the task
    if (item.questPrereqs) {
      item.questPrereqs.split(';').map(s => s.trim()).filter(Boolean).forEach(prereqName => {
        const prereqItem = SPINE_DATA.find(d => d.name.toLowerCase() === prereqName.toLowerCase());
        if (prereqItem) collect(prereqItem.order);
      });
    }
    if (!completedSet.has(order)) needed.push(order);
  }

  collect(goalOrder);
  // Stable sort by spine order (preserves dep ordering within same tier)
  needed.sort((a, b) => a - b);

  // ── Step 2: Build spine plan items ──
  const spineItems = needed.map(order => {
    const sp = SPINE_DATA.find(d => d.order === order);
    return {
      id: planUid(),
      itemType: 'existing',
      spineOrder: order,
      name: sp.name,
      type: sp.type,
      skillReqs: sp.skillReqs || '',
      location: sp.location || '',
      notes: sp.info || '',
      done: false,
      _isGoal: order === goalOrder
    };
  });

  // ── Step 3: Collect skill training tasks ──
  // For each unique skill gap across all needed items, create one training task
  // at the highest level required for that skill.
  const skillNeeds = {}; // skillLower -> { skill, level, neededFor }
  needed.forEach(order => {
    const sp = SPINE_DATA.find(d => d.order === order);
    if (!sp.skillReqs) return;
    parseSkillReqs(sp.skillReqs).forEach(req => {
      if (req.isQP) return;
      const key = req.skill.toLowerCase();
      if (['combat', 'total level'].includes(key)) return;
      const have = parseInt(playerStats[key]) || 1;
      if (have >= req.level) return; // already meets it
      if (!skillNeeds[key] || skillNeeds[key].level < req.level) {
        skillNeeds[key] = { skill: req.skill, level: req.level, neededFor: sp.name };
      }
    });
  });

  const skillItems = Object.values(skillNeeds)
    .sort((a, b) => a.skill.localeCompare(b.skill))
    .map(req => ({
      id: planUid(),
      itemType: 'custom',
      name: 'Train ' + req.skill + ' to ' + req.level,
      type: 'Activity/Goal',
      skillReqs: '',
      location: '',
      notes: 'Required for: ' + req.neededFor,
      done: false,
      _isSkillTask: true
    }));

  // Skill tasks first, then spine tasks in order
  const fullPath = skillItems.concat(spineItems);

  if (!fullPath.length) {
    alert('All prerequisites for "' + goalItem.name + '" are already complete — nothing to add!');
    return;
  }

  // ── Step 4: Show preview modal ──
  window._pendingPath = fullPath;
  showPathPreview(goalItem.name, fullPath);
}

function showPathPreview(goalName, items) {
  const overlay = document.getElementById('path-preview-overlay');
  if (!overlay) return;

  // Store goal name so tree view can use it
  window._pendingGoalName = goalName;

  document.getElementById('path-preview-title').textContent = 'Path to: ' + goalName;

  const spineCount  = items.filter(i => !i._isSkillTask).length;
  const skillCount  = items.filter(i => i._isSkillTask).length;
  const summaryEl   = document.getElementById('path-preview-summary');
  summaryEl.innerHTML =
    '<span><strong>' + items.length + '</strong> steps total</span>' +
    '<span><strong>' + spineCount + '</strong> quest/task/activity</span>' +
    (skillCount ? '<span><strong>' + skillCount + '</strong> skill training</span>' : '');

  const listEl = document.getElementById('path-preview-list');
  listEl.innerHTML = items.map((item, i) => {
    const cls = item._isSkillTask ? 'is-skill-task' : item._isGoal ? 'is-goal' : '';
    const badge = item.type
      ? '<span class="type-badge badge-' + item.type.replace('/','\/') + '" style="font-size:0.6rem;padding:0.1rem 0.4rem">' + item.type + '</span>'
      : '';
    const goalTag = item._isGoal ? ' <span style="font-size:0.65rem;color:var(--gold-dark);font-family:Cinzel,serif">&#9733; GOAL</span>' : '';
    return '<div class="path-preview-item ' + cls + '">' +
      '<span class="path-preview-num">' + (i + 1) + '</span>' +
      '<span class="path-preview-name">' + item.name + goalTag + '</span>' +
      badge +
    '</div>';
  }).join('');

  const footerEl = document.getElementById('path-preview-footer');
  if (planItems.length) {
    footerEl.innerHTML =
      '<button class="btn btn-ghost" onclick="closePathPreview()">Cancel</button>' +
      '<button class="btn btn-ghost btn-append" onclick="commitPath('+"'append'"+ ')">+ Append to Path</button>' +
      '<button class="btn btn-ghost btn-replace" onclick="commitPath('+"'replace'"+')">&#x21BA; Replace Path</button>';
  } else {
    footerEl.innerHTML =
      '<button class="btn btn-ghost" onclick="closePathPreview()">Cancel</button>' +
      '<button class="btn" onclick="commitPath('+"'replace'"+')">Add to Custom Path</button>';
  }

  overlay.classList.add('open');
}

function pathPreviewOverlayClick(e) {
  if (e.target === document.getElementById('path-preview-overlay')) closePathPreview();
}

function closePathPreview() {
  const overlay = document.getElementById('path-preview-overlay');
  if (overlay) overlay.classList.remove('open');
  window._pendingPath = null;
  window._pendingGoalName = null;
}

function commitPath(mode) {
  const newItems = window._pendingPath;
  if (!newItems) return;

  if (mode === 'replace' || !planItems.length) {
    planItems = newItems;
  } else {
    // Append — skip duplicates by spineOrder (for spine items) or name (for skill tasks)
    const existingOrders = new Set(planItems.filter(i => i.spineOrder).map(i => i.spineOrder));
    const existingNames  = new Set(planItems.map(i => i.name.toLowerCase()));
    planItems = planItems.concat(newItems.filter(i =>
      i.spineOrder ? !existingOrders.has(i.spineOrder) : !existingNames.has(i.name.toLowerCase())
    ));
  }

  savePlan();
  closePathPreview();
  closeDetailBtn();
  showPage('planner');
  renderPlanner();
  window._pendingPath = null;
}

// ─── TREE VIEW ────────────────────────────────────────────────────────────────

function openTreeViewFromPreview() {
  var goalName = window._pendingGoalName;
  if (!goalName) return;
  showTreeView(goalName);
}

function showTreeView(goalName) {
  var root = buildQuestTree(goalName, new Set());
  if (!root) return;
  document.getElementById('tree-view-title').textContent = goalName;
  document.getElementById('tree-view-subtitle').textContent = '';
  document.getElementById('tree-view-body').innerHTML = renderTreeNode(root, true, 0);
  document.getElementById('tree-view-legend').innerHTML =
    '<span><span style="color:#5aae5a">&#x2713;</span> Completed</span>' +
    '<span><span style="color:#ae5a5a">&#x2717;</span> Incomplete</span>' +
    '<span style="opacity:0.55">Completed nodes collapsed by default &mdash; click &#x25B6; to expand</span>';
  document.getElementById('tree-view-overlay').classList.add('open');
}

// Build recursive tree. visitedPath prevents circular refs within a branch
// but allows the same quest to appear across different branches (correct).
function buildQuestTree(name, visitedPath) {
  var key = name.toLowerCase();
  if (visitedPath.has(key)) return null;
  var item = SPINE_DATA.find(function(d) { return d.name.toLowerCase() === key; });
  if (!item) return { name: name, type: null, order: -1, completed: false, children: [] };
  var completed = completedSet.has(item.order);
  var prereqNames = item.questPrereqs
    ? item.questPrereqs.split(';').map(function(s) { return s.trim(); }).filter(Boolean)
    : [];
  var newVisited = new Set(visitedPath);
  newVisited.add(key);
  var children = prereqNames
    .map(function(p) { return buildQuestTree(p, newVisited); })
    .filter(Boolean);
  // Sort: incomplete first, completed last
  children.sort(function(a, b) {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });
  return { name: item.name, type: item.type, order: item.order, completed: completed, children: children };
}

function renderTreeNode(node, isRoot, depth) {
  var uid = 'tn_' + (node.order >= 0 ? node.order : 'x' + Math.floor(Math.random() * 999999));
  var hasChildren = node.children && node.children.length > 0;
  // Completed nodes with children collapse by default. Root always open.
  var startCollapsed = !isRoot && node.completed && hasChildren;

  var nodeClass = 'tree-node';
  if (isRoot) nodeClass += ' tn-root';
  nodeClass += node.completed ? ' tn-done' : ' tn-todo';

  var typeBadge = node.type
    ? '<span class="type-badge" style="font-size:0.59rem;padding:0.08rem 0.32rem;flex-shrink:0">' + node.type + '</span>'
    : '';

  var statusIcon = node.completed
    ? '<span class="tn-status tn-status-done">&#x2713;</span>'
    : '<span class="tn-status tn-status-todo">&#x2717;</span>';

  var toggleBtn = hasChildren
    ? '<button class="tn-toggle" onclick="treeToggle(\'' + uid + '\')" title="' + (startCollapsed ? 'Expand' : 'Collapse') + '">' + (startCollapsed ? '&#x25B6;' : '&#x25BC;') + '</button>'
    : '<span class="tn-toggle-spacer"></span>';

  var html = '<div class="tree-node-wrap" id="' + uid + '">';
  html += '<div class="' + nodeClass + '">';
  html += toggleBtn;
  html += statusIcon;
  html += '<span class="tn-name">' + node.name + '</span>';
  html += typeBadge;
  html += '</div>';

  if (hasChildren) {
    html += '<div class="tree-children' + (startCollapsed ? ' tree-collapsed' : '') + '" id="' + uid + '_ch">';
    for (var i = 0; i < node.children.length; i++) {
      html += renderTreeNode(node.children[i], false, depth + 1);
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function treeToggle(uid) {
  var ch = document.getElementById(uid + '_ch');
  var btn = document.querySelector('#' + uid + ' > .tree-node > .tn-toggle');
  if (!ch || !btn) return;
  var collapsed = ch.classList.toggle('tree-collapsed');
  btn.innerHTML = collapsed ? '&#x25B6;' : '&#x25BC;';
  btn.title = collapsed ? 'Expand' : 'Collapse';
}

function treeExpandAll() {
  document.querySelectorAll('#tree-view-body .tree-children').forEach(function(el) {
    el.classList.remove('tree-collapsed');
  });
  document.querySelectorAll('#tree-view-body .tn-toggle').forEach(function(btn) {
    btn.innerHTML = '&#x25BC;';
    btn.title = 'Collapse';
  });
}

function treeCollapseAll() {
  // Collapse everything except root's direct children (keep top level visible)
  document.querySelectorAll('#tree-view-body .tree-children .tree-children').forEach(function(el) {
    el.classList.add('tree-collapsed');
    var uid = el.id.replace('_ch', '');
    var btn = document.querySelector('#' + uid + ' > .tree-node > .tn-toggle');
    if (btn) { btn.innerHTML = '&#x25B6;'; btn.title = 'Expand'; }
  });
}

function closeTreeView() {
  var overlay = document.getElementById('tree-view-overlay');
  if (overlay) overlay.classList.remove('open');
}

function treeViewOverlayClick(e) {
  if (e.target === document.getElementById('tree-view-overlay')) closeTreeView();
}

// ============================================================
// DOWNSTREAM UNLOCKS TREE
// ============================================================

// Built lazily on first use and cached — SPINE_DATA doesn't change at runtime
var _downstreamIndex = null;

function getDownstreamIndex() {
  if (_downstreamIndex) return _downstreamIndex;
  var idx = {}; // order → [child orders that list it as a prereq]
  var nameToOrder = {};
  SPINE_DATA.forEach(function(item) {
    nameToOrder[item.name.toLowerCase().trim()] = item.order;
  });
  SPINE_DATA.forEach(function(item) {
    var prereqsRaw = (item.questPrereqs || '').trim();
    if (!prereqsRaw) return;
    prereqsRaw.split(';').forEach(function(raw) {
      raw = raw.trim();
      if (!raw) return;
      var parentOrder = nameToOrder[raw.toLowerCase()];
      if (parentOrder === undefined) return; // unresolvable freetext — skip
      if (!idx[parentOrder]) idx[parentOrder] = [];
      idx[parentOrder].push(item.order);
    });
  });
  _downstreamIndex = idx;
  return idx;
}

// Build downstream tree node.
// visitedPath: Set of orders already on THIS branch — prevents cycles.
// cameFromOrder: the parent order we arrived from, so we can exclude it from co-prereq annotation.
function buildDownstreamNode(order, cameFromOrder, visitedPath) {
  if (visitedPath.has(order)) return null; // cycle guard
  var item = SPINE_DATA.find(function(d) { return d.order === order; });
  if (!item) return null;

  var completed = completedSet.has(order);

  // Co-prereqs: other prerequisites of this node besides the one we came from
  var nameToItem = {};
  SPINE_DATA.forEach(function(d) { nameToItem[d.name.toLowerCase().trim()] = d; });

  var coPrereqs = [];
  if (item.questPrereqs) {
    item.questPrereqs.split(';').forEach(function(raw) {
      raw = raw.trim();
      if (!raw) return;
      var prereqItem = nameToItem[raw.toLowerCase()];
      var prereqOrder = prereqItem ? prereqItem.order : -1;
      if (prereqOrder === cameFromOrder) return; // this is the path we came from — exclude
      coPrereqs.push({
        name: prereqItem ? prereqItem.name : raw,
        order: prereqOrder,
        completed: prereqOrder >= 0 ? completedSet.has(prereqOrder) : false,
        resolved: prereqOrder >= 0
      });
    });
  }

  // Build children recursively
  var idx = getDownstreamIndex();
  var childOrders = idx[order] || [];
  var newVisited = new Set(visitedPath);
  newVisited.add(order);

  var children = childOrders
    .map(function(childOrder) {
      return buildDownstreamNode(childOrder, order, newVisited);
    })
    .filter(Boolean);

  // Sort: incomplete/partially-unlocked first, fully completed last
  children.sort(function(a, b) {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  return {
    order: order,
    name: item.name,
    type: item.type,
    completed: completed,
    coPrereqs: coPrereqs,
    children: children
  };
}

function renderDownstreamNode(node, isRoot, depth) {
  var uid = 'ds_' + node.order;
  var hasChildren = node.children && node.children.length > 0;
  var startCollapsed = !isRoot && node.completed && hasChildren;

  var nodeClass = 'tree-node';
  if (isRoot) nodeClass += ' tn-root';
  nodeClass += node.completed ? ' tn-done' : ' tn-todo';

  var typeBadge = node.type
    ? '<span class="type-badge" style="font-size:0.59rem;padding:0.08rem 0.32rem;flex-shrink:0">' + node.type + '</span>'
    : '';

  var statusIcon = node.completed
    ? '<span class="tn-status tn-status-done">&#x2713;</span>'
    : '<span class="tn-status tn-status-todo">&#x2717;</span>';

  var toggleBtn = hasChildren
    ? '<button class="tn-toggle" onclick="treeToggle(\'' + uid + '\')" title="' + (startCollapsed ? 'Expand' : 'Collapse') + '">' + (startCollapsed ? '&#x25B6;' : '&#x25BC;') + '</button>'
    : '<span class="tn-toggle-spacer"></span>';

  var html = '<div class="tree-node-wrap" id="' + uid + '">';
  html += '<div class="' + nodeClass + '">';
  html += toggleBtn;
  html += statusIcon;
  html += '<span class="tn-name">' + node.name + '</span>';
  html += typeBadge;
  html += '</div>';

  // Co-prereq annotation pills (not on root, not when only 1 total prereq)
  if (!isRoot && node.coPrereqs.length > 0) {
    var MAX_PILLS = 4;
    var pills = node.coPrereqs.slice(0, MAX_PILLS).map(function(p) {
      var cls = 'tn-also-pill' + (p.completed ? ' done' : '');
      var tick = p.completed ? '✓ ' : '';
      return '<span class="' + cls + '">' + tick + p.name + '</span>';
    }).join('');
    var extra = node.coPrereqs.length - MAX_PILLS;
    if (extra > 0) {
      pills += '<span class="tn-also-pill more">+' + extra + ' more</span>';
    }
    html += '<div class="tn-also-wrap"><span class="tn-also-label">needs alongside:</span>' + pills + '</div>';
  }

  if (hasChildren) {
    html += '<div class="tree-children' + (startCollapsed ? ' tree-collapsed' : '') + '" id="' + uid + '_ch">';
    for (var i = 0; i < node.children.length; i++) {
      html += renderDownstreamNode(node.children[i], false, depth + 1);
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function showDownstreamTree(order) {
  var item = SPINE_DATA.find(function(d) { return d.order === order; });
  if (!item) return;

  var idx = getDownstreamIndex();
  var directCount = (idx[order] || []).length;

  if (directCount === 0) {
    // Nothing downstream — show a message in the modal rather than an empty tree
    document.getElementById('tree-view-title').textContent = item.name;
    document.getElementById('tree-view-subtitle').textContent = '';
    document.getElementById('tree-view-body').innerHTML =
      '<p style="color:var(--text-muted);font-size:0.9rem;padding:1.25rem 0;font-family:\'IM Fell English\',serif;font-style:italic;line-height:1.6">' +
      'This stands alone — nothing in the progression spine requires it as a stepping stone.' +
      '</p>';
    document.getElementById('tree-view-legend').innerHTML =
      '<span style="font-family:\'IM Fell English\',serif;font-style:italic;color:var(--stone-lighter)">Complete it for its own reward.</span>';
    document.getElementById('tree-view-overlay').classList.add('open');
    return;
  }

  var root = buildDownstreamNode(order, -1, new Set());
  if (!root) return;

  function countNodes(n) { return 1 + n.children.reduce(function(s, c) { return s + countNodes(c); }, 0); }
  var total = countNodes(root) - 1;

  document.getElementById('tree-view-title').textContent = item.name;
  document.getElementById('tree-view-subtitle').innerHTML =
    '<span style="font-family:\'IM Fell English\',serif;font-style:italic">Opens the path to ' + total + ' further ' + (total === 1 ? 'challenge' : 'challenges') + '</span>';
  document.getElementById('tree-view-body').innerHTML = renderDownstreamNode(root, true, 0);
  document.getElementById('tree-view-legend').innerHTML =
    '<span><span style="color:#5aae5a">&#x2713;</span> Already conquered</span>' +
    '<span><span style="color:#ae5a5a">&#x2717;</span> Yet to be done</span>' +
    '<span style="font-family:\'IM Fell English\',serif;font-style:italic;color:var(--stone-lighter)">Faded names — other deeds required alongside this road</span>';
  document.getElementById('tree-view-overlay').classList.add('open');
}


function toggleRandomPanel() {
  const panel = document.getElementById('floating-rand-panel');
  const isOpening = !panel.classList.contains('open');
  closeAllOraclePanels();
  if (isOpening) {
    panel.classList.add('open');
    renderFloatingHistory();
  }
}

function closeRandomPanel() {
  document.getElementById('floating-rand-panel').classList.remove('open');
}

function getSpinPool(suggestionMode = false) {
  return SPINE_DATA.filter(item => {
    if (!randFilters.has(item.type) && !(item.type === 'Activity/Goal' && randFilters.has('Activity/Goal'))) return false;
    if (randFilters.has('incomplete') && completedSet.has(item.order)) return false;
    if (suggestionMode) {
      if (completedSet.has(item.order)) return false;
      return isAchievableNear(item);
    }
    if (randFilters.has('available')) {
      const met = meetsReqs(item);
      if (met === false) return false;
    }
    return true;
  });
}

function floatSpin(suggestionMode = false) {
  const pool = getSpinPool(suggestionMode);
  const resultEl = document.getElementById('float-spin-result');
  const idleEl = document.getElementById('float-spin-idle');

  if (!pool.length) {
    resultEl.style.display = 'none';
    idleEl.style.display = 'block';
    idleEl.textContent = suggestionMode
      ? 'No tasks found within your skill range. Add stats on My Stats page!'
      : 'No items match your filters!';
    return;
  }

  // Shuffle animation
  idleEl.style.display = 'none';
  resultEl.style.display = 'block';
  const nameEl = document.getElementById('float-spin-name');
  nameEl.classList.add('spinning');

  let ticks = 0;
  const interval = setInterval(() => {
    const rand = pool[Math.floor(Math.random() * pool.length)];
    nameEl.textContent = rand.name;
    ticks++;
    if (ticks > 15) {
      clearInterval(interval);
      nameEl.classList.remove('spinning');
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      currentSpinItem = chosen;
      showFloatResult(chosen);
      addToSpinHistory(chosen);
    }
  }, 55);
}

function showFloatResult(item) {
  document.getElementById('float-spin-name').textContent = item.name;
  document.getElementById('float-spin-order').textContent = `#${item.order}`;
  document.getElementById('float-spin-type').innerHTML =
    `<span class="type-badge badge-${item.type.replace('/','\\/')}">${item.type}</span>` +
    (item.bossTier ? ` <span class="boss-tier tier-${item.bossTier.toLowerCase().replace(' tier','').trim()}">${item.bossTier}</span>` : '');

  const metaEl = document.getElementById('float-spin-meta');
  const parts = [];
  if (item.location) parts.push(`📍 ${item.location}`);
  if (item.skillReqs) parts.push(`⚔ ${item.skillReqs.split(';')[0].trim()}${item.skillReqs.includes(';') ? '…' : ''}`);
  metaEl.textContent = parts.join('  ·  ');

  document.getElementById('float-spin-result').style.display = 'block';
  document.getElementById('float-spin-idle').style.display = 'none';

  // Show Build Path bar only for quest-type items (or any item with a spine order)
  const bpBar = document.getElementById('frand-buildpath-bar');
  if (bpBar) bpBar.style.display = 'block';
}

function floatBuildPath() {
  if (!currentSpinItem) return;
  closeRandomPanel();
  buildPathTo(currentSpinItem.order);
}

function floatMarkDone() {
  if (currentSpinItem) {
    completedSet.add(currentSpinItem.order);
    saveToStorage();
    updateProgress();
    renderTable();
  }
  floatSpin(false);
}

function addToSpinHistory(item) {
  spinHistory = spinHistory.filter(h => h.order !== item.order);
  spinHistory.unshift({ order: item.order, name: item.name, type: item.type });
  if (spinHistory.length > 10) spinHistory.pop();
  saveToStorage();
  renderFloatingHistory();
}

function renderFloatingHistory() {
  const list = document.getElementById('float-history-list');
  const wrap = document.getElementById('float-history-wrap');
  if (!list) return;
  if (!spinHistory.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = spinHistory.map((h, i) =>
    `<div class="float-hist-item" onclick="openDetail(${h.order}); closeRandomPanel()">
      <span class="float-hist-num">${i + 1}</span>
      <span class="float-hist-name">${h.name}</span>
      <span class="type-badge badge-${h.type.replace('/','\\/')}" style="font-size:0.65rem;padding:0.1rem 0.4rem">${h.type}</span>
    </div>`
  ).join('');
}

function clearSpinHistory() {
  spinHistory = [];
  currentSpinItem = null;
  saveToStorage();
  document.getElementById('float-spin-result').style.display = 'none';
  document.getElementById('float-spin-idle').style.display = 'block';
  document.getElementById('float-spin-idle').textContent = 'Press a button to receive your task…';
  const bpBar = document.getElementById('frand-buildpath-bar');
  if (bpBar) bpBar.style.display = 'none';
  renderFloatingHistory();
}

function toggleRandFilter(f) {
  if (randFilters.has(f)) {
    randFilters.delete(f);
  } else {
    randFilters.add(f);
  }
  // Update chips inside floating panel
  document.querySelectorAll(`[data-rfilter="${f}"]`).forEach(el => {
    el.classList.toggle('active', randFilters.has(f));
  });
}

// ============================================================
// CLOSE ALL ORACLES HELPER
// ============================================================
function closeAllOraclePanels() {
  document.getElementById('floating-rand-panel').classList.remove('open');
  document.getElementById('combat-oracle-panel').classList.remove('open');
  document.getElementById('clog-oracle-panel').classList.remove('open');
}

// ============================================================
// ORACLE LAUNCHER
// ============================================================
var oracleLauncherOpen = false;

function toggleOracleLauncher() {
  oracleLauncherOpen = !oracleLauncherOpen;
  var launcher = document.getElementById('oracle-launcher');
  launcher.classList.toggle('open', oracleLauncherOpen);

  if (!oracleLauncherOpen) {
    collapseOracleTriggers();
    closeAllOraclePanels();
    return;
  }

  var ids = ['trigger-task', 'trigger-combat', 'trigger-clog'];
  ids.forEach(function(id, i) {
    var el = document.getElementById(id);
    el.style.transition = 'none';
    el.classList.remove('oracle-visible');
    void el.offsetWidth;
    el.style.transition = '';
    setTimeout(function() {
      el.classList.add('oracle-visible');
    }, i * 60);
  });

  setTimeout(function() {
    document.addEventListener('click', outsideOracleLauncherHandler);
  }, 0);
}

function outsideOracleLauncherHandler(e) {
  var launcher = document.getElementById('oracle-launcher');
  var t = document.getElementById('trigger-task');
  var c = document.getElementById('trigger-combat');
  var g = document.getElementById('trigger-clog');
  var panels = [
    document.getElementById('floating-rand-panel'),
    document.getElementById('combat-oracle-panel'),
    document.getElementById('clog-oracle-panel')
  ];
  var clickedInside = [launcher, t, c, g].some(function(el) { return el && el.contains(e.target); }) ||
    panels.some(function(p) { return p && p.contains(e.target); });
  if (!clickedInside) {
    collapseOracleLauncher();
  }
}

function collapseOracleLauncher() {
  oracleLauncherOpen = false;
  document.getElementById('oracle-launcher').classList.remove('open');
  collapseOracleTriggers();
  closeAllOraclePanels();
  document.removeEventListener('click', outsideOracleLauncherHandler);
}

function collapseOracleTriggers() {
  ['trigger-task','trigger-combat','trigger-clog'].forEach(function(id) {
    document.getElementById(id).classList.remove('oracle-visible');
  });
}

// ============================================================
// COMBAT ORACLE
// ============================================================
function toggleCombatPanel() {
  var panel = document.getElementById('combat-oracle-panel');
  var isOpening = !panel.classList.contains('open');
  closeAllOraclePanels();
  if (isOpening) {
    panel.classList.add('open');
    renderCombatHistory();
  }
}

function closeCombatPanel() {
  document.getElementById('combat-oracle-panel').classList.remove('open');
}

function toggleCAFilter(f) {
  if (caFilters.has(f)) {
    caFilters.delete(f);
  } else {
    caFilters.add(f);
  }
  document.querySelectorAll('[data-cafilter="' + f + '"]').forEach(function(el) {
    el.classList.toggle('active', caFilters.has(f));
  });
}

function getCAPool(suggest) {
  if (typeof CA_DATA === 'undefined') return [];
  return CA_DATA.filter(function(ca) {
    if (!caFilters.has(ca.tier)) return false;
    if (caFilters.has('ca-incomplete') && caCompleted[ca.id]) return false;
    if (suggest && caCompleted[ca.id]) return false;
    return true;
  });
}

function getCAPoolSuggested() {
  if (typeof CA_DATA === 'undefined') return [];
  var tierOrder = ['Easy','Medium','Hard','Elite','Master','Grandmaster'];
  for (var i = 0; i < tierOrder.length; i++) {
    var tier = tierOrder[i];
    if (!caFilters.has(tier)) continue;
    var pool = CA_DATA.filter(function(ca) {
      return ca.tier === tier && !caCompleted[ca.id];
    });
    if (pool.length) return pool;
  }
  return getCAPool(true);
}

function combatSpin(suggest) {
  var pool = suggest ? getCAPoolSuggested() : getCAPool(false);
  var resultEl = document.getElementById('combat-spin-result');
  var idleEl   = document.getElementById('combat-spin-idle');

  if (!pool.length) {
    resultEl.style.display = 'none';
    idleEl.style.display = 'block';
    idleEl.textContent = suggest
      ? 'No incomplete tasks found. Try a higher tier!'
      : 'No tasks match your filters!';
    return;
  }

  idleEl.style.display = 'none';
  resultEl.style.display = 'block';
  var nameEl = document.getElementById('combat-spin-name');
  nameEl.classList.add('spinning');

  var ticks = 0;
  var interval = setInterval(function() {
    nameEl.textContent = pool[Math.floor(Math.random() * pool.length)].name;
    ticks++;
    if (ticks > 15) {
      clearInterval(interval);
      nameEl.classList.remove('spinning');
      var chosen = pool[Math.floor(Math.random() * pool.length)];
      currentCombatItem = chosen;
      showCombatResult(chosen);
      addToCombatHistory(chosen);
    }
  }, 55);
}

function showCombatResult(ca) {
  document.getElementById('combat-spin-name').textContent = ca.name;
  var tierKey = ca.tier.toLowerCase().replace(' ','');
  document.getElementById('combat-spin-badges').innerHTML =
    '<span class="ca-tier-badge ca-tier-' + tierKey + '">' + ca.tier + '</span>' +
    '<span class="ca-type-badge">' + ca.type + '</span>' +
    (caCompleted[ca.id] ? ' <span style="color:var(--green-light);font-size:0.7rem">✓ Done</span>' : '');
  document.getElementById('combat-spin-boss').textContent = '👹 ' + ca.boss;
  document.getElementById('combat-spin-desc').textContent = ca.description;
  document.getElementById('combat-spin-result').style.display = 'block';
  document.getElementById('combat-spin-idle').style.display = 'none';
}

function combatMarkDone() {
  if (currentCombatItem) {
    caCompleted[currentCombatItem.id] = true;
    localStorage.setItem('ps_ca_completed', JSON.stringify(caCompleted));
  }
  combatSpin(false);
}

function addToCombatHistory(ca) {
  combatHistory = combatHistory.filter(function(h) { return h.id !== ca.id; });
  combatHistory.unshift({ id: ca.id, name: ca.name, tier: ca.tier });
  if (combatHistory.length > 10) combatHistory.pop();
  renderCombatHistory();
}

function renderCombatHistory() {
  var list = document.getElementById('combat-history-list');
  var wrap = document.getElementById('combat-history-wrap');
  if (!list) return;
  if (!combatHistory.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = combatHistory.map(function(h, i) {
    var tierKey = h.tier.toLowerCase().replace(' ','');
    return '<div class="float-hist-item">' +
      '<span class="float-hist-num">' + (i + 1) + '</span>' +
      '<span class="float-hist-name">' + h.name + '</span>' +
      '<span class="ca-tier-badge ca-tier-' + tierKey + '" style="font-size:0.6rem;padding:0.08rem 0.35rem">' + h.tier + '</span>' +
      '</div>';
  }).join('');
}

function clearCombatHistory() {
  combatHistory = [];
  currentCombatItem = null;
  document.getElementById('combat-spin-result').style.display = 'none';
  document.getElementById('combat-spin-idle').style.display = 'block';
  document.getElementById('combat-spin-idle').textContent = 'Press a button to receive your task…';
  renderCombatHistory();
}

// ============================================================
// COLLECTION ORACLE
// ============================================================
function toggleClogOraclePanel() {
  var panel = document.getElementById('clog-oracle-panel');
  var isOpening = !panel.classList.contains('open');
  closeAllOraclePanels();
  if (isOpening) {
    panel.classList.add('open');
    renderClogOracleHistory();
  }
}

function closeClogOraclePanel() {
  document.getElementById('clog-oracle-panel').classList.remove('open');
}

function toggleClogOracleFilter(f) {
  if (clogOracleFilters.has(f)) {
    clogOracleFilters.delete(f);
  } else {
    clogOracleFilters.add(f);
  }
  document.querySelectorAll('[data-clogfilter="' + f + '"]').forEach(function(el) {
    el.classList.toggle('active', clogOracleFilters.has(f));
  });
}

function getClogOraclePool(suggest) {
  if (!window.CLOG_DATA) return [];
  return CLOG_DATA.filter(function(item) {
    if (!clogOracleFilters.has(item.category)) return false;
    if (clogOracleFilters.has('clog-missing') && isObtained(item.name)) return false;
    if (suggest && isObtained(item.name)) return false;
    return true;
  });
}

function getClogOraclePoolSuggested() {
  if (!window.CLOG_DATA) return [];
  var sourceTotals = {};
  var sourceGot = {};
  CLOG_DATA.forEach(function(item) {
    if (!clogOracleFilters.has(item.category)) return;
    if (!sourceTotals[item.source]) { sourceTotals[item.source] = 0; sourceGot[item.source] = 0; }
    sourceTotals[item.source]++;
    if (isObtained(item.name)) sourceGot[item.source]++;
  });
  var best = null, bestPct = -1;
  Object.keys(sourceTotals).forEach(function(src) {
    var pct = sourceTotals[src] > 0 ? sourceGot[src] / sourceTotals[src] : 0;
    if (pct < 1 && pct > bestPct) { bestPct = pct; best = src; }
  });
  if (!best) return getClogOraclePool(true);
  return CLOG_DATA.filter(function(item) {
    return item.source === best && !isObtained(item.name);
  });
}

function clogOracleSpin(suggest) {
  var pool = suggest ? getClogOraclePoolSuggested() : getClogOraclePool(false);
  var resultEl = document.getElementById('clog-oracle-result');
  var idleEl   = document.getElementById('clog-oracle-idle');

  if (!pool.length) {
    resultEl.style.display = 'none';
    idleEl.style.display = 'block';
    idleEl.textContent = suggest
      ? 'No missing items found — you might be done!'
      : 'No items match your filters!';
    return;
  }

  idleEl.style.display = 'none';
  resultEl.style.display = 'block';
  var nameEl = document.getElementById('clog-oracle-name');
  nameEl.classList.add('spinning');

  var ticks = 0;
  var interval = setInterval(function() {
    nameEl.textContent = pool[Math.floor(Math.random() * pool.length)].name;
    ticks++;
    if (ticks > 15) {
      clearInterval(interval);
      nameEl.classList.remove('spinning');
      var chosen = pool[Math.floor(Math.random() * pool.length)];
      currentClogOracleItem = chosen;
      showClogOracleResult(chosen);
      addToClogOracleHistory(chosen);
    }
  }, 55);
}

function showClogOracleResult(item) {
  document.getElementById('clog-oracle-name').textContent = item.name;
  document.getElementById('clog-oracle-source').textContent = '📍 ' + item.source;
  var srcItems = CLOG_DATA.filter(function(i) { return i.source === item.source; });
  var got = srcItems.filter(function(i) { return isObtained(i.name); }).length;
  var total = srcItems.length;
  var pct = total > 0 ? Math.round(got / total * 100) : 0;
  document.getElementById('clog-oracle-progress').innerHTML =
    '<span>' + got + '</span>/' + total + ' obtained from this source (' + pct + '%)' +
    (isObtained(item.name) ? ' <span style="color:var(--green-light)">✓ Already obtained</span>' : '');
  document.getElementById('clog-oracle-result').style.display = 'block';
  document.getElementById('clog-oracle-idle').style.display = 'none';
}

function clogOracleMarkObtained() {
  if (currentClogOracleItem) {
    var key = currentClogOracleItem.name.toLowerCase();
    clogObtained[key] = true;
    saveClogObtained();
    if (document.getElementById('page-clog') && document.getElementById('page-clog').classList.contains('active')) {
      renderClogMain();
      renderClogSidebar();
      updateClogSummary();
    }
  }
  clogOracleSpin(false);
}

function addToClogOracleHistory(item) {
  clogOracleHistory = clogOracleHistory.filter(function(h) { return h.name !== item.name; });
  clogOracleHistory.unshift({ name: item.name, source: item.source });
  if (clogOracleHistory.length > 10) clogOracleHistory.pop();
  renderClogOracleHistory();
}

function renderClogOracleHistory() {
  var list = document.getElementById('clog-oracle-history-list');
  var wrap = document.getElementById('clog-oracle-history-wrap');
  if (!list) return;
  if (!clogOracleHistory.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = clogOracleHistory.map(function(h, i) {
    return '<div class="float-hist-item">' +
      '<span class="float-hist-num">' + (i + 1) + '</span>' +
      '<span class="float-hist-name">' + h.name + '</span>' +
      '<span style="font-size:0.65rem;color:var(--stone-lighter);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">' + h.source + '</span>' +
      '</div>';
  }).join('');
}

function clearClogOracleHistory() {
  clogOracleHistory = [];
  currentClogOracleItem = null;
  document.getElementById('clog-oracle-result').style.display = 'none';
  document.getElementById('clog-oracle-idle').style.display = 'block';
  document.getElementById('clog-oracle-idle').textContent = 'Press a button to receive your task…';
  renderClogOracleHistory();
}
function buildSkillsGrid() {
  const grid = document.getElementById('skills-grid');
  if (!grid) return;
  grid.innerHTML = SKILLS.map(s =>
    `<div class="skill-input-row">
      <span class="skill-name-lbl">${s.name}</span>
      <div class="skill-mob-top">
        <img class="skill-icon" src="${s.icon}" alt="${s.name}" title="${s.name}" onerror="this.style.display='none'">
        <div class="skill-level-wrap">
          <input class="skill-level-input" type="number" min="1" max="99"
            id="skill-${s.name.toLowerCase()}"
            value="${playerStats[s.name.toLowerCase()] || ''}"
            placeholder="–">
          <span class="skill-level-max">/99</span>
        </div>
      </div>
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
    if (el && el.value) playerStats[s.name.toLowerCase()] = Math.min(99, Math.max(1, parseInt(el.value) || 1));
  });
  const qpInput = document.getElementById('qp-input');
  if (qpInput) playerQP = parseInt(qpInput.value) || 0;
  SPINE_DATA.forEach(item => {
    if (isAutoAchievable(item) && !completedSet.has(item.order)) completedSet.add(item.order);
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
  if (combatEl) combatEl.textContent = getCombatLevel();
  if (totalEl) totalEl.textContent = getTotalLevel();
  renderDashboard();
}

function renderDashboardWhenReady() {
  setTimeout(function() {
    if (typeof caCompleted !== 'undefined') renderDashboard();
  }, 50);
}

function renderDashboard() {
  if (typeof caCompleted === 'undefined') return renderDashboardWhenReady();
  const dash = document.getElementById('account-dashboard');
  if (!dash || typeof SPINE_DATA === 'undefined') return;

  // ── MILESTONE BADGES ────────────────────────────────────────
  (function renderMilestones() {
    const wrap = document.getElementById('dash-milestones-wrap');
    const container = document.getElementById('dash-milestones');
    if (!wrap || !container) return;

    // Pre-compute data the badge conditions need
    const levels = SKILLS.map(s => parseInt(playerStats[s.name.toLowerCase()]) || 1);
    const ninetyNines = SKILLS.filter(s => (parseInt(playerStats[s.name.toLowerCase()]) || 1) >= 99);
    const totalQuests = SPINE_DATA.filter(i => i.type === 'Quest').length;
    const doneQuests  = SPINE_DATA.filter(i => i.type === 'Quest' && completedSet.has(i.order)).length;
    const allDiaries  = SPINE_DATA.filter(i => i.type === 'Diary');
    const doneDiaryOrders = new Set(allDiaries.filter(i => completedSet.has(i.order)).map(i => i.order));
    const cb = getCombatLevel();

    const tierDone = tier => allDiaries
      .filter(i => i.name.startsWith(tier + ' '))
      .every(i => doneDiaryOrders.has(i.order));

    // CA points for badge conditions
    const _caPoints = (typeof CA_DATA !== 'undefined' && typeof caCompleted !== 'undefined')
      ? CA_DATA.reduce((s, t) => s + (caCompleted[t.id] ? t.points : 0), 0)
      : 0;

    // Static badge definitions (always shown — locked or earned)
    // Individual skill-99 badges are dynamically appended below
    const BADGE_DEFS = [
      { id: 'qp_cape',      label: 'Quest Cape',    desc: 'All ' + totalQuests + ' quests complete',    icon: 'https://oldschool.runescape.wiki/images/Quest_point_cape.png',       earned: doneQuests === totalQuests && totalQuests > 0, gold: true  },
      { id: 'diary_easy',   label: 'Easy Diaries',  desc: 'All Easy diaries complete',                  icon: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',    earned: tierDone('Easy'),   gold: false },
      { id: 'diary_medium', label: 'Med Diaries',   desc: 'All Medium diaries complete',                icon: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',    earned: tierDone('Medium'), gold: false },
      { id: 'diary_hard',   label: 'Hard Diaries',  desc: 'All Hard diaries complete',                  icon: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',    earned: tierDone('Hard'),   gold: false },
      { id: 'diary_elite',  label: 'Elite Diaries', desc: 'All Elite diaries complete',                 icon: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',    earned: tierDone('Elite'),  gold: false },
      { id: 'diary_cape',   label: 'Diary Cape',    desc: 'All ' + allDiaries.length + ' diaries complete', icon: 'https://oldschool.runescape.wiki/images/Achievement_diary_cape.png', earned: allDiaries.every(i => doneDiaryOrders.has(i.order)), gold: true },
      { id: 'first_99',     label: 'First 99',      desc: 'Reached level 99 in a skill',                icon: ninetyNines.length > 0 ? 'https://oldschool.runescape.wiki/images/' + ninetyNines[0].name + '_icon.png' : 'https://oldschool.runescape.wiki/images/Stats_icon.png', earned: ninetyNines.length > 0, gold: false },
      { id: 'max_cape',     label: 'Max Cape',      desc: 'All ' + SKILLS.length + ' skills at level 99', icon: 'https://oldschool.runescape.wiki/images/Max_cape.png',               earned: levels.every(l => l >= 99), gold: true },
      { id: 'cb_100',       label: 'CB 100',        desc: 'Combat level 100',                           icon: 'https://oldschool.runescape.wiki/images/Worn_Equipment.png',          earned: cb >= 100,  gold: false },
      { id: 'cb_110',       label: 'CB 110',        desc: 'Combat level 110',                           icon: 'https://oldschool.runescape.wiki/images/Worn_Equipment.png',          earned: cb >= 110,  gold: false },
      { id: 'cb_126',       label: 'Max Combat',    desc: 'Combat level 126',                           icon: 'https://oldschool.runescape.wiki/images/Worn_Equipment.png',          earned: cb >= 126,  gold: true  },
      { id: 'fire_cape',    label: 'Fire Cape',     desc: 'Defeated TzTok-Jad',                         icon: 'https://oldschool.runescape.wiki/images/Fire_cape.png',               earned: completedSet.has(279),  gold: false },
      { id: 'infernal_cape',label: 'Infernal Cape', desc: 'Defeated TzKal-Zuk',                         icon: 'https://oldschool.runescape.wiki/images/Infernal_cape.png',           earned: completedSet.has(466),  gold: true  },
      // ── Combat Achievements ──────────────────────────────────────────────────
      { id: "ca_hilt1", label: "Hilt 1",     desc: "41 CA points — Ghommal's hilt 1",      icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_1.png",    earned: _caPoints >= 41,   gold: false },
      { id: "ca_hilt2", label: "Hilt 2",     desc: "161 CA points — Ghommal's hilt 2",     icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_2.png",    earned: _caPoints >= 161,  gold: false },
      { id: "ca_hilt3", label: "Hilt 3",     desc: "416 CA points — Ghommal's hilt 3",     icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_3.png",    earned: _caPoints >= 416,  gold: false },
      { id: "ca_hilt4", label: "Hilt 4",     desc: "1,064 CA points — Ghommal's hilt 4",   icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_4.png",    earned: _caPoints >= 1064, gold: false },
      { id: "ca_hilt5", label: "Hilt 5",     desc: "1,904 CA points — Ghommal's hilt 5",   icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_5.png",    earned: _caPoints >= 1904, gold: false },
      { id: "ca_hilt6", label: "Hilt 6", desc: "2,630 CA points — Ghommal's hilt 6 + Tzkal slayer helm", icon: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_6.png", earned: _caPoints >= 2630, gold: true  },
    ];

    // Append one badge per skill 99 beyond the first (only earned ones — these don't have a locked state)
    ninetyNines.slice(1).forEach(s => {
      BADGE_DEFS.push({
        id: '99_' + s.name.toLowerCase(),
        label: s.name + ' 99',
        desc: 'Level 99 ' + s.name,
        icon: 'https://oldschool.runescape.wiki/images/' + s.name + '_icon.png',
        earned: true,
        gold: false,
        dynamicOnly: true, // never shown locked
      });
    });

    // Sparkle detection: diff against last-seen earned set in localStorage
    const LS_KEY = 'osrs_spine_badges_seen';
    var seenRaw = '{}';
    try { seenRaw = localStorage.getItem(LS_KEY) || '{}'; } catch(e) {}
    var seen = {};
    try { seen = JSON.parse(seenRaw); } catch(e) {}

    const newlyEarned = new Set();
    BADGE_DEFS.forEach(b => {
      if (b.earned && !seen[b.id]) newlyEarned.add(b.id);
    });

    // Persist updated seen state
    if (newlyEarned.size > 0) {
      BADGE_DEFS.forEach(b => { if (b.earned) seen[b.id] = true; });
      try { localStorage.setItem(LS_KEY, JSON.stringify(seen)); } catch(e) {}
    }

    // Render — static badges always shown (locked or earned); dynamic 99s only when earned
    const toRender = BADGE_DEFS.filter(b => !b.dynamicOnly || b.earned);
    wrap.style.display = 'block';

    container.innerHTML = toRender.map(b => {
      const cls = ['ms-badge', b.earned ? 'ms-earned' : 'ms-locked', b.earned && b.gold ? 'ms-gold' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" title="${b.desc}" data-badge-id="${b.id}">` +
        `<img src="${b.icon}" alt="" onerror="this.style.display='none'">` +
        `<span>${b.label}</span>` +
        `</div>`;
    }).join('');

    // Trigger sparkle on newly-earned badges after DOM settles
    if (newlyEarned.size > 0) {
      requestAnimationFrame(function() {
        newlyEarned.forEach(function(id) {
          var el = container.querySelector('[data-badge-id="' + id + '"]');
          if (!el) return;
          el.classList.add('ms-sparkle');
          el.addEventListener('animationend', function() {
            el.classList.remove('ms-sparkle');
          }, { once: true });
        });
      });
    }
  })();
  // ── END MILESTONE BADGES ─────────────────────────────────────

  const levels = SKILLS.map(s => parseInt(playerStats[s.name.toLowerCase()]) || 1);
  const total = levels.reduce((a,b) => a+b, 0);
  const nineties = levels.filter(l => l >= 99).length;
  const eighties = levels.filter(l => l >= 80 && l < 99).length;
  const maxTotal = SKILLS.length * 99;
  const fromMax = maxTotal - total;

  const totalQuests = SPINE_DATA.filter(i => i.type === 'Quest').length;
  const doneQuests = SPINE_DATA.filter(i => i.type === 'Quest' && completedSet.has(i.order)).length;
  const totalBosses = SPINE_DATA.filter(i => i.type === 'Boss').length;
  const doneBosses = SPINE_DATA.filter(i => i.type === 'Boss' && completedSet.has(i.order)).length;
  const totalDiaries = SPINE_DATA.filter(i => i.type === 'Diary').length;
  const doneDiaries = SPINE_DATA.filter(i => i.type === 'Diary' && completedSet.has(i.order)).length;
  const clogObtainedCount = (window.CLOG_DATA && typeof clogObtained !== 'undefined') ? (() => {
    const u = {};
    window.CLOG_DATA.forEach(i => { if (clogObtained[i.name.toLowerCase()]) u[i.name.toLowerCase()] = true; });
    return Object.keys(u).length;
  })() : 0;

  const _ca = (typeof CA_DATA !== 'undefined' && typeof caCompleted !== 'undefined');
  const caDoneCount = _ca ? CA_DATA.filter(t => caCompleted[t.id]).length : 0;
  const caTotalCount = _ca ? CA_DATA.length : 637;
  const caEarnedPts = _ca ? CA_DATA.reduce((s, t) => s + (caCompleted[t.id] ? t.points : 0), 0) : 0;

  const cards = [
    { label: 'Total Level', value: total.toLocaleString(), sub: fromMax + ' from max' },
    { label: '99s', value: nineties, sub: eighties + ' at 80+' },
    { label: 'Quests', value: doneQuests + '/' + totalQuests, sub: Math.round(doneQuests/totalQuests*100) + '%' },
    { label: 'Bosses', value: doneBosses + '/' + totalBosses, sub: Math.round(doneBosses/totalBosses*100) + '%' },
    { label: 'Diaries', value: doneDiaries + '/' + totalDiaries, sub: Math.round(doneDiaries/totalDiaries*100) + '%' },
    { label: 'Combat Tasks', value: caDoneCount + '/' + caTotalCount, sub: caEarnedPts.toLocaleString() + ' pts' },
    { label: 'Collection Log', value: clogObtainedCount + '/1698', sub: Math.round(clogObtainedCount/1698*100) + '%' },
  ];

  const cardsEl = document.getElementById('dash-cards');
  if (cardsEl) cardsEl.innerHTML = cards.map(c => `
    <div style="background:var(--stone);border:1px solid var(--stone-lighter);border-radius:4px;padding:0.75rem 1rem;">
      <div style="font-family:'Cinzel',serif;font-size:0.6rem;font-weight:600;color:var(--text-muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:0.3rem">${c.label}</div>
      <div style="font-family:'Cinzel',serif;font-size:1.15rem;font-weight:700;color:var(--gold);line-height:1">${c.value}</div>
      <div style="font-size:0.72rem;color:var(--stone-lighter);margin-top:0.2rem">${c.sub}</div>
    </div>`).join('');

  const skillColorFn = function(lvl) {
    if (lvl >= 99) return { bg: 'rgba(200,168,75,0.35)', border: 'var(--gold)', text: 'var(--gold)' };
    if (lvl >= 90) return { bg: 'rgba(42,107,42,0.35)', border: '#3d9e3d', text: '#6fc96f' };
    if (lvl >= 70) return { bg: 'rgba(26,58,107,0.35)', border: '#2a5aa0', text: '#7ab0f0' };
    if (lvl >= 50) return { bg: 'rgba(120,80,200,0.2)', border: '#6040a0', text: '#b080f0' };
    if (lvl >= 30) return { bg: 'rgba(61,53,38,0.8)', border: 'var(--stone-lighter)', text: 'var(--text-muted)' };
    return { bg: 'rgba(42,33,24,0.6)', border: 'var(--stone-light)', text: 'var(--stone-lighter)' };
  };

  const heatmapEl = document.getElementById('dash-heatmap');
  if (heatmapEl) heatmapEl.innerHTML = SKILLS.map(s => {
    const lvl = parseInt(playerStats[s.name.toLowerCase()]) || 1;
    const c = skillColorFn(lvl);
    return `<div title="${s.name}: ${lvl}" style="background:${c.bg};border:1px solid ${c.border};border-radius:3px;padding:5px 4px;text-align:center;cursor:default;">
      <img src="${s.icon}" style="width:14px;height:14px;object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto 2px">
      <div style="font-family:'Cinzel',serif;font-size:0.62rem;font-weight:700;color:${c.text};line-height:1">${lvl}</div>
    </div>`;
  }).join('');

  const progBarFn = function(label, done, tot, color) {
    const pct = tot > 0 ? Math.round(done/tot*100) : 0;
    return `<div style="background:var(--stone);border:1px solid var(--stone-lighter);border-radius:4px;padding:0.6rem 0.85rem;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">
        <span style="font-family:'Cinzel',serif;font-size:0.7rem;font-weight:600;color:var(--text-muted);letter-spacing:0.05em">${label}</span>
        <span style="font-family:'Cinzel',serif;font-size:0.75rem;color:${color}">${done} / ${tot} <span style="color:var(--stone-lighter);font-size:0.65rem">${pct}%</span></span>
      </div>
      <div style="height:4px;background:var(--stone-mid);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width 0.4s"></div>
      </div>
    </div>`;
  };

  const tierBars = TIERS.map(t => {
    const items = SPINE_DATA.filter(i => i.order >= t.minOrder && i.order <= t.maxOrder);
    const done = items.filter(i => completedSet.has(i.order)).length;
    const colors = { early:'#6fc96f', mid:'#7ab0f0', late:'#e07070', end:'var(--gold)' };
    return progBarFn(t.label, done, items.length, colors[t.id] || 'var(--gold)');
  });

  const typeBars = [
    { label:'Quests', type:'Quest', color:'#6fc96f' },
    { label:'Bosses', type:'Boss', color:'#e07070' },
    { label:'Activities', type:'Activity/Goal', color:'#7ab0f0' },
    { label:'Diaries', type:'Diary', color:'#90d8ff' },
    { label:'Miniquests', type:'Miniquest', color:'#f0c858' },
    { label:'Unlocks', type:'Unlock', color:'#c090ff' },
  ].map(t => {
    const items = SPINE_DATA.filter(i => i.type === t.type);
    const done = items.filter(i => completedSet.has(i.order)).length;
    return progBarFn(t.label, done, items.length, t.color);
  });

  const progEl = document.getElementById('dash-progression');
  if (progEl) progEl.innerHTML = [...tierBars, ...typeBars].join('');

  const clogEl = document.getElementById('dash-clog');
  if (clogEl && window.CLOG_DATA && typeof clogObtained !== 'undefined') {
    const clogCats = ['Bosses','Raids','Clues','Minigames','Other'];
    const clogColors = { Bosses:'#e07070', Raids:'var(--gold)', Clues:'#f0c858', Minigames:'#7ab0f0', Other:'#b080f0' };
    clogEl.innerHTML = clogCats.map(cat => {
      const items = window.CLOG_DATA.filter(i => i.category === cat);
      const uniqueNames = [...new Set(items.map(i => i.name.toLowerCase()))];
      const got = uniqueNames.filter(n => clogObtained[n]).length;
      return progBarFn(cat, got, uniqueNames.length, clogColors[cat] || 'var(--gold)');
    }).join('');
  }
}

function clearStats() {
  if (!confirm('Reset all stats?')) return;
  playerStats = Object.fromEntries(SKILLS.map(s => [s.name.toLowerCase(), 1]));
  playerQP = 0;
  try { localStorage.removeItem('osrs_spine_badges_seen'); } catch(e) {}
  saveToStorage();
  buildSkillsGrid();
  renderTable();
}

// ============================================================
// NAV
// ============================================================
function setCaBossFilter(bossName) {
  var searchEl = document.getElementById('ca-search');
  if (searchEl) { searchEl.value = bossName; }
  // find which tier this boss has the most tasks in and switch to it
  caActiveTier = 'All';
}

function showPage(name) {
  // Multi-page split: navigate to the appropriate standalone HTML file
  if (name === 'progression') { location.href = 'index.html'; }
  else { location.href = name + '.html'; }
}

// ============================================================
// SCROLL TO TOP
// ============================================================
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', onPageScroll);
function onPageScroll() {
  var btn = document.getElementById('back-to-top');
  if (btn) btn.classList.toggle('visible', window.scrollY > 400);
  updateTierFloat();
}

function updateTierFloat() {
  var float = document.getElementById('tier-float');
  if (!float) return;
  var page = document.getElementById('page-progression');
  if (!page || !page.classList.contains('active')) { float.style.display = 'none'; return; }

  // Use live measurement - immune to header height changes and scroll position
  var thead = document.querySelector('#main-table thead');
  var pinTop = thead ? Math.round(thead.getBoundingClientRect().bottom) : 102;

  var rows = document.querySelectorAll('.tier-header-row');
  var active = null;
  rows.forEach(function(row) {
    if (row.getBoundingClientRect().top < pinTop) active = row;
  });

  if (!active) { float.style.display = 'none'; return; }

  // Hide if section is collapsed (next sibling is another tier header)
  var nextSib = active.nextElementSibling;
  if (!nextSib || nextSib.classList.contains('tier-header-row')) { float.style.display = 'none'; return; }

  // Hide if next tier header has already reached the pin (sections bumping)
  var sibling = nextSib;
  while (sibling) {
    if (sibling.classList.contains('tier-header-row')) {
      if (sibling.getBoundingClientRect().top <= pinTop + 2) { float.style.display = 'none'; return; }
      break;
    }
    sibling = sibling.nextElementSibling;
  }

  var inner = active.querySelector('.tier-header-inner');
  if (!inner) { float.style.display = 'none'; return; }

  float.innerHTML = inner.outerHTML;
  float.setAttribute('data-tier', active.getAttribute('data-tier') || '');

  var cs = getComputedStyle(active);
  var bgDark  = cs.getPropertyValue('--tier-bg-dark').trim() || '#1a1408';
  var bg      = cs.getPropertyValue('--tier-bg').trim() || '#1a1408';
  var color   = cs.getPropertyValue('--tier-color').trim() || '#c8a84b';
  float.style.cssText = 'display:block;position:fixed;left:0;right:0;z-index:18;cursor:pointer;' +
    'top:' + pinTop + 'px;' +
    'background:linear-gradient(90deg,' + bgDark + ' 0%,' + bg + ' 60%,' + bgDark + ' 100%);' +
    'border-top:2px solid ' + color + ';' +
    'border-bottom:1px solid rgba(255,255,255,0.08);' +
    'box-shadow:0 3px 12px rgba(0,0,0,0.8);';

  float.onclick = function() { toggleTier(active.getAttribute('data-tier')); };
}



// ============================================================
// START
// ============================================================
function updateHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  const th = document.querySelector('#main-table thead');
  if (th) document.documentElement.style.setProperty('--thead-h', th.offsetHeight + 'px');
}
window.addEventListener('resize', updateHeaderHeight);
// Also re-measure after first render when thead is populated
window.addEventListener('load', updateHeaderHeight);
updateHeaderHeight();

// ============================================================
// CUSTOM PATH PLANNER
// ============================================================

var planItems = [];
var planDragSrc = null;
var planEditId = null;

init();

function planUid() {
  return 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function loadPlan() {
  try {
    var raw = localStorage.getItem('osrs_custom_plan');
    planItems = raw ? JSON.parse(raw) : [];
  } catch (e) { planItems = []; }
}

function savePlan() {
  localStorage.setItem('osrs_custom_plan', JSON.stringify(planItems));
}

// ---- RENDER ----

function renderPlanner() {
  var list = document.getElementById('planner-list');
  var empty = document.getElementById('planner-empty');
  var tableWrap = document.getElementById('planner-table-wrap');
  var progWrap = document.getElementById('planner-progress-wrap');
  if (!list) return;

  if (!planItems.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (tableWrap) tableWrap.style.display = 'none';
    if (progWrap) progWrap.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'block';
  if (progWrap) progWrap.style.display = 'flex';

  var nonNote = planItems.filter(function(i) { return i.itemType !== 'note'; });
  var doneCount = nonNote.filter(function(i) { return i.done; }).length;
  var total = nonNote.length;
  var pct = total ? Math.round(doneCount / total * 100) : 0;

  var dc = document.getElementById('planner-done-count');
  var tc = document.getElementById('planner-total-count');
  var pf = document.getElementById('planner-prog-fill');
  var pp = document.getElementById('planner-prog-pct');
  if (dc) dc.textContent = doneCount;
  if (tc) tc.textContent = total;
  if (pf) pf.style.width = pct + '%';
  if (pp) pp.textContent = pct + '%';

  list.innerHTML = planItems.map(function(item, idx) {
    return buildPlanItemHtml(item, idx);
  }).join('');

  initPlanDragDrop();
}

function buildPlanItemHtml(item, idx) {
  var doneClass = item.done ? ' done' : '';
  var checkBox = '<div class="check-box' + (item.done ? ' checked' : '') + '"></div>';

  if (item.itemType === 'note') {
    var noteText = item.text
      ? item.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      : '<em>Empty note — click to edit</em>';
    return '<tr class="planner-item item-note' + doneClass + '" data-id="' + item.id + '" draggable="true">' +
      '<td class="pt-drag-cell">&#8942;&#8942;</td>' +
      '<td class="pt-check-cell" onclick="togglePlanDone(\'' + item.id + '\')">' + checkBox + '</td>' +
      '<td class="pt-note-cell" colspan="5" onclick="openPlannerModal(\'note\', \'' + item.id + '\')">&#128221; ' + noteText + '</td>' +
      '<td class="pt-act-cell">' +
        '<button class="planner-action-btn del" onclick="deletePlanItem(\'' + item.id + '\')" title="Delete">&#x2715;</button>' +
      '</td>' +
    '</tr>';
  }

  var typeBadge = item.type ? '<span class="type-badge badge-' + item.type.replace('/','\/') + '">' + item.type + '</span>' : '—';
  var customTag = item.itemType === 'custom' ? ' <span style="font-size:0.6rem;padding:0.1rem 0.3rem;background:rgba(74,127,200,0.15);border:1px solid #4a7fc8;border-radius:3px;color:#8abcf8;font-family:\'Cinzel\',serif;vertical-align:middle">Custom</span>' : '';

  var reqs = item.skillReqs || '—';
  var loc  = item.location  || '—';
  var info = item.notes     || '—';

  // Highlight unmet skill reqs
  if (item.skillReqs && Object.keys(playerStats).length) {
    var reqParts = item.skillReqs.split(';').map(function(r) {
      r = r.trim();
      var m = r.match(/^([A-Za-z]+)\s+(\d+)$/);
      if (m) {
        var sk = m[1], lvl = parseInt(m[2]);
        var have = parseInt(playerStats[sk]) || 1;
        if (have < lvl) return '<span class="req-unmet">' + r + '</span>';
      }
      return r;
    });
    reqs = reqParts.join('; ');
  }

  return '<tr class="planner-item item-' + item.itemType + doneClass + '" data-id="' + item.id + '" draggable="true">' +
    '<td class="pt-drag-cell">&#8942;&#8942;</td>' +
    '<td class="pt-check-cell" onclick="togglePlanDone(\'' + item.id + '\')">' + checkBox + '</td>' +
    '<td class="pt-name-cell"' + (item.spineOrder ? ' onclick="openDetail(' + item.spineOrder + ')" style="cursor:pointer" title="View details"' : '') + '><span class="pi-name">' + (item.name || 'Unnamed Task') + '</span>' + customTag + '</td>' +
    '<td>' + typeBadge + '</td>' +
    '<td class="pt-reqs-cell">' + reqs + '</td>' +
    '<td class="pt-loc-cell">' + loc + '</td>' +
    '<td class="pt-info-cell">' + info + '</td>' +
    '<td class="pt-act-cell">' +
      '<button class="planner-action-btn" onclick="openPlannerModal(\'' + item.itemType + '\', \'' + item.id + '\')" title="Edit">&#9998;</button>' +
      '<button class="planner-action-btn del" onclick="deletePlanItem(\'' + item.id + '\')" title="Delete">&#x2715;</button>' +
    '</td>' +
  '</tr>';
}

function togglePlanDone(id) {
  var item = planItems.filter(function(i) { return i.id === id; })[0];
  if (item) { item.done = !item.done; savePlan(); renderPlanner(); }
}

function deletePlanItem(id) {
  planItems = planItems.filter(function(i) { return i.id !== id; });
  savePlan();
  renderPlanner();
}

function clearPlan() {
  if (!planItems.length) return;
  if (!confirm('Clear your entire custom plan? This cannot be undone.')) return;
  planItems = [];
  savePlan();
  renderPlanner();
}

// ---- DRAG AND DROP ----

function initPlanDragDrop() {
  var items = document.querySelectorAll('#planner-list tr.planner-item[draggable="true"]');
  items.forEach(function(el) {
    el.addEventListener('dragstart', function(e) {
      planDragSrc = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function() {
      el.classList.remove('dragging');
      document.querySelectorAll('#planner-list tr.planner-item').forEach(function(i) { i.classList.remove('drag-over'); });
    });
    el.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (el !== planDragSrc) {
        document.querySelectorAll('#planner-list tr.planner-item').forEach(function(i) { i.classList.remove('drag-over'); });
        el.classList.add('drag-over');
      }
    });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      if (planDragSrc && planDragSrc !== el) {
        var srcId = planDragSrc.dataset.id;
        var dstId = el.dataset.id;
        var srcIdx = planItems.findIndex(function(i) { return i.id === srcId; });
        var dstIdx = planItems.findIndex(function(i) { return i.id === dstId; });
        if (srcIdx !== -1 && dstIdx !== -1) {
          var moved = planItems.splice(srcIdx, 1)[0];
          planItems.splice(dstIdx, 0, moved);
          savePlan();
          renderPlanner();
        }
      }
    });
  });
}

// ---- MODAL ----

function openPlannerModal(mode, editId) {
  planEditId = editId || null;
  planMode = mode;

  var overlay  = document.getElementById('planner-modal-overlay');
  var titleEl  = document.getElementById('planner-modal-title');
  var body     = document.getElementById('planner-modal-body');
  var footer   = document.getElementById('planner-modal-footer');
  if (!overlay || !body) return;

  var editing = planEditId
    ? planItems.filter(function(i) { return i.id === planEditId; })[0]
    : null;

  // Footer is static — save button always calls planSave()
  if (mode === 'existing') {
    titleEl.textContent = 'Add Existing Task';
    footer.innerHTML = '<button class="btn btn-ghost" onclick="closePlannerModal()">Cancel</button>';
    body.innerHTML =
      '<div class="planner-field">' +
        '<label>Search Tasks</label>' +
        '<input type="text" id="plan-search-input" placeholder="Type task name..." autocomplete="off" oninput="planSearchResults(this.value)">' +
        '<div class="planner-search-results" id="plan-search-results">' +
          '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.82rem;font-style:italic">Start typing to search...</div>' +
        '</div>' +
      '</div>';
    setTimeout(function() {
      var inp = document.getElementById('plan-search-input');
      if (inp) inp.focus();
    }, 50);
  }

  else if (mode === 'custom') {
    titleEl.textContent = editing ? 'Edit Custom Task' : 'Add Custom Task';
    footer.innerHTML =
      '<button class="btn btn-ghost" onclick="closePlannerModal()">Cancel</button>' +
      '<button class="btn" onclick="planSave()">Save Task</button>';
    var typeOpts = ['', 'Quest', 'Boss', 'Activity/Goal', 'Unlock', 'Miniquest', 'Diary'].map(function(t) {
      var sel = (editing && editing.type === t) ? ' selected' : '';
      return '<option value="' + t + '"' + sel + '>' + (t || '— None —') + '</option>';
    }).join('');
    body.innerHTML =
      '<div class="planner-field"><label>Task Name *</label>' +
        '<input type="text" id="pf-name" placeholder="e.g. Get 70 Attack" value="' + (editing ? esc(editing.name) : '') + '">' +
      '</div>' +
      '<div class="planner-field"><label>Type</label>' +
        '<select id="pf-type">' + typeOpts + '</select>' +
      '</div>' +
      '<div class="planner-field"><label>Skill Requirements</label>' +
        '<input type="text" id="pf-reqs" placeholder="e.g. Attack 70; Defence 60" value="' + (editing ? esc(editing.skillReqs) : '') + '">' +
      '</div>' +
      '<div class="planner-field"><label>Location</label>' +
        '<input type="text" id="pf-loc" placeholder="e.g. Lumbridge" value="' + (editing ? esc(editing.location) : '') + '">' +
      '</div>' +
      '<div class="planner-field"><label>Notes</label>' +
        '<textarea id="pf-notes" placeholder="Any notes...">' + (editing ? esc(editing.notes) : '') + '</textarea>' +
      '</div>';
    setTimeout(function() { var n = document.getElementById('pf-name'); if (n) n.focus(); }, 50);
  }

  else if (mode === 'note') {
    titleEl.textContent = editing ? 'Edit Note' : 'Add Note';
    footer.innerHTML =
      '<button class="btn btn-ghost" onclick="closePlannerModal()">Cancel</button>' +
      '<button class="btn" onclick="planSave()">Save Note</button>';
    body.innerHTML =
      '<div class="planner-field"><label>Note Text</label>' +
        '<textarea id="pf-note-text" placeholder="Write your progress note here..." style="min-height:100px">' + (editing ? esc(editing.text) : '') + '</textarea>' +
      '</div>';
    setTimeout(function() { var n = document.getElementById('pf-note-text'); if (n) n.focus(); }, 50);
  }

  overlay.classList.add('open');
}

// Safe HTML escape for values injected into attributes
function esc(v) {
  return (v || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Single save dispatcher — called from static onclick in footer HTML
function planSave() {
  if (planMode === 'custom') savePlanCustom();
  else if (planMode === 'note') savePlanNote();
}


function plannerOverlayClick(e) {
  if (e.target === document.getElementById('planner-modal-overlay')) closePlannerModal();
}

function closePlannerModal() {
  var overlay = document.getElementById('planner-modal-overlay');
  if (overlay) overlay.classList.remove('open');
  planEditId = null;
}

function planSearchResults(query) {
  var container = document.getElementById('plan-search-results');
  if (!container) return;
  if (!query || !query.trim()) {
    container.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.82rem;font-style:italic">Start typing to search...</div>';
    return;
  }
  var q = query.toLowerCase();
  var results = SPINE_DATA.filter(function(item) {
    return item.name.toLowerCase().indexOf(q) !== -1 || item.type.toLowerCase().indexOf(q) !== -1;
  }).slice(0, 30);

  if (!results.length) {
    container.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.82rem">No matches found.</div>';
    return;
  }

  container.innerHTML = results.map(function(item) {
    return '<div class="planner-search-result" data-order="' + item.order + '">' +
      '<span class="planner-search-result-name">' + item.name + '</span>' +
      '<span class="type-badge" style="font-size:0.65rem;padding:0.1rem 0.4rem">' + item.type + '</span>' +
      '<span class="planner-search-result-order">#' + item.order + '</span>' +
    '</div>';
  }).join('');
  // Wire clicks via event delegation - no inline onclick needed
  var rows = container.querySelectorAll('.planner-search-result');
  rows.forEach(function(row) {
    row.addEventListener('click', function() {
      addExistingToPlan(parseInt(row.dataset.order, 10));
    });
  });
}

function addExistingToPlan(order) {
  var spine = SPINE_DATA.filter(function(d) { return d.order === order; })[0];
  if (!spine) return;
  planItems.push({
    id: planUid(),
    itemType: 'existing',
    spineOrder: order,
    name: spine.name,
    type: spine.type,
    skillReqs: spine.skillReqs || '',
    location: spine.location || '',
    notes: spine.info || '',
    done: false
  });
  savePlan();
  renderPlanner();
  // Keep modal open — clear search for next add
  var inp = document.getElementById('plan-search-input');
  if (inp) { inp.value = ''; planSearchResults(''); inp.focus(); }
}

function savePlanCustom() {
  var nameEl = document.getElementById('pf-name');
  if (!nameEl || !nameEl.value.trim()) { if (nameEl) nameEl.focus(); return; }
  var item = {
    id: planEditId || planUid(),
    itemType: 'custom',
    name: nameEl.value.trim(),
    type: (document.getElementById('pf-type') || {}).value || '',
    skillReqs: (document.getElementById('pf-reqs') || {}).value || '',
    location: (document.getElementById('pf-loc') || {}).value || '',
    notes: (document.getElementById('pf-notes') || {}).value || '',
    done: planEditId ? ((planItems.filter(function(i) { return i.id === planEditId; })[0] || {}).done || false) : false
  };
  if (planEditId) {
    var idx = planItems.findIndex(function(i) { return i.id === planEditId; });
    if (idx !== -1) planItems[idx] = item; else planItems.push(item);
  } else {
    planItems.push(item);
  }
  savePlan();
  renderPlanner();
  closePlannerModal();
}

function savePlanNote() {
  var textEl = document.getElementById('pf-note-text');
  var item = {
    id: planEditId || planUid(),
    itemType: 'note',
    text: textEl ? textEl.value.trim() : '',
    done: planEditId ? ((planItems.filter(function(i) { return i.id === planEditId; })[0] || {}).done || false) : false
  };
  if (planEditId) {
    var idx = planItems.findIndex(function(i) { return i.id === planEditId; });
    if (idx !== -1) planItems[idx] = item; else planItems.push(item);
  } else {
    planItems.push(item);
  }
  savePlan();
  renderPlanner();
  closePlannerModal();
}

// ---- EXPORT / IMPORT ----

// ─── Share / Import ───────────────────────────────────────────────────────────

function planToShareCode(items) {
  // Strip runtime-only fields — recipient starts with a fresh plan
  var compact = items.map(function(i) {
    var out = { t: i.itemType };
    if (i.spineOrder) out.o = i.spineOrder;
    if (i.name)       out.n = i.name;
    if (i.type)       out.y = i.type;
    if (i.skillReqs)  out.r = i.skillReqs;
    if (i.location)   out.l = i.location;
    if (i.notes)      out.x = i.notes;
    return out;
  });
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

function planFromShareCode(code) {
  var compact = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!Array.isArray(compact)) throw new Error('bad');
  return compact.map(function(i) {
    var item = {
      id: planUid(),
      itemType: i.t || 'custom',
      name: i.n || '',
      type: i.y || 'Activity/Goal',
      skillReqs: i.r || '',
      location: i.l || '',
      notes: i.x || '',
      done: false
    };
    if (i.o) {
      item.spineOrder = i.o;
      // Backfill name/type from SPINE_DATA if missing
      var sp = SPINE_DATA.find(function(d) { return d.order === i.o; });
      if (sp) {
        item.name     = item.name || sp.name;
        item.type     = item.type || sp.type;
        item.skillReqs = item.skillReqs || sp.skillReqs || '';
        item.location = item.location || sp.location || '';
        item.notes    = item.notes || sp.info || '';
      }
    }
    return item;
  });
}

// Share modal
function openShareModal() {
  if (!planItems.length) { alert('Your plan is empty — nothing to share.'); return; }
  document.getElementById('share-code-text').value = planToShareCode(planItems);
  document.getElementById('share-copy-btn').textContent = '📋 Copy to Clipboard';
  setShareTab('code');
  document.getElementById('share-plan-overlay').classList.add('open');
}
function closeShareModal() {
  document.getElementById('share-plan-overlay').classList.remove('open');
}
function shareOverlayClick(e) {
  if (e.target === document.getElementById('share-plan-overlay')) closeShareModal();
}
function setShareTab(tab) {
  document.getElementById('share-code-panel').style.display = tab === 'code' ? '' : 'none';
  document.getElementById('share-file-panel').style.display = tab === 'file' ? '' : 'none';
  document.getElementById('share-tab-code').className = tab === 'code' ? 'btn' : 'btn btn-ghost';
  document.getElementById('share-tab-file').className = tab === 'file' ? 'btn' : 'btn btn-ghost';
}
function copyShareCode() {
  var text = document.getElementById('share-code-text').value;
  var btn = document.getElementById('share-copy-btn');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      btn.textContent = '✓ Copied!';
      setTimeout(function() { btn.textContent = '📋 Copy to Clipboard'; }, 2000);
    });
  } else {
    // Fallback for older browsers
    var ta = document.getElementById('share-code-text');
    ta.select();
    document.execCommand('copy');
    btn.textContent = '✓ Copied!';
    setTimeout(function() { btn.textContent = '📋 Copy to Clipboard'; }, 2000);
  }
}
function downloadPlanFile() {
  var blob = new Blob([JSON.stringify(planItems, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'progressscape-plan.json';
  a.click();
}

// Import modal
function openImportModal() {
  document.getElementById('import-code-input').value = '';
  setImportTab('code');
  document.getElementById('import-plan-overlay').classList.add('open');
}
function closeImportModal() {
  document.getElementById('import-plan-overlay').classList.remove('open');
}
function importOverlayClick(e) {
  if (e.target === document.getElementById('import-plan-overlay')) closeImportModal();
}
function setImportTab(tab) {
  document.getElementById('import-code-panel').style.display = tab === 'code' ? '' : 'none';
  document.getElementById('import-file-panel').style.display = tab === 'file' ? '' : 'none';
  document.getElementById('import-tab-code').className = tab === 'code' ? 'btn' : 'btn btn-ghost';
  document.getElementById('import-tab-file').className = tab === 'file' ? 'btn' : 'btn btn-ghost';
}
function importFromCode(mode) {
  var code = document.getElementById('import-code-input').value.trim();
  if (!code) { alert('Paste a share code first.'); return; }
  try {
    var imported = planFromShareCode(code);
    if (!imported.length) throw new Error('empty');
    if (mode === 'replace') {
      if (planItems.length && !confirm('Replace your current plan (' + planItems.length + ' items) with the imported path (' + imported.length + ' items)?')) return;
      planItems = imported;
    } else {
      planItems = planItems.concat(imported);
    }
    savePlan();
    renderPlanner();
    closeImportModal();
  } catch(err) {
    alert('Invalid share code — could not import.');
  }
}

// File import (unchanged behaviour, file input still wired here)
function importPlanClick() {
  document.getElementById('plan-import-input').click();
}
function importPlan(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('bad format');
      if (planItems.length && !confirm('Replace your current plan (' + planItems.length + ' items) with imported (' + imported.length + ' items)?')) return;
      planItems = imported;
      savePlan();
      renderPlanner();
      closeImportModal();
    } catch(err) {
      alert('Could not import — invalid file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// Legacy export shim (keeps any old onclick="exportPlan()" references working)
function exportPlan() { openShareModal(); }

// ============================================================
// URL FILTER STATE
// ============================================================
function pushFilterState() {
  try {
    var params = new URLSearchParams();
    var filters = Array.from(activeFilters).filter(function(f) { return f !== 'all'; });
    if (filters.length) params.set('filter', filters.join(','));
    var search = document.getElementById('search-input');
    if (search && search.value) params.set('q', search.value);
    var str = params.toString();
    history.replaceState(null, '', window.location.pathname + (str ? '?' + str : ''));
  } catch(e) {}
}

function loadFilterFromURL() {
  try {
    var params = new URLSearchParams(window.location.search);
    var filter = params.get('filter');
    var q = params.get('q');
    if (filter) {
      filter.split(',').forEach(function(f) {
        f = f.trim();
        if (f) setFilter(f, true);
      });
      renderTable();
    }
    if (q) {
      var s = document.getElementById('search-input');
      if (s) { s.value = q; renderTable(); }
    }
  } catch(e) {}
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', function(e) {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    var page = document.getElementById('page-progression');
    if (page && page.classList.contains('active')) {
      e.preventDefault();
      var s = document.getElementById('search-input');
      if (s) { s.focus(); s.select(); }
    }
  }
  if (e.key === 'Escape') {
    var detail = document.getElementById('detail-overlay');
    if (detail && detail.classList.contains('open')) closeDetailBtn();
  }
});

// ============================================================
// COLLECTION LOG
// ============================================================

var clogState = {
  cat: 'All',
  activeSource: null,
  filterObtained: false,
  filterMissing: false
};

// User's obtained items — keyed by item name (lowercase), value true
// When Supabase plugin data arrives, populate this from the sync:
//   clogObtained['abyssal whip'] = true;
var clogObtained = JSON.parse(localStorage.getItem('ps_clog_obtained') || '{}');

function saveClogObtained() {
  localStorage.setItem('ps_clog_obtained', JSON.stringify(clogObtained));
}

function toggleClogItem(name) {
  var key = name.toLowerCase();
  if (clogObtained[key]) {
    delete clogObtained[key];
  } else {
    clogObtained[key] = true;
  }
  saveClogObtained();
  renderClogMain();
  renderClogSidebar();
  updateClogSummary();
}

function initClog() {
  if (!window.CLOG_DATA) return;
  clogState.activeSource = null;
  renderClogSidebar();
  renderClogMain();
  updateClogSummary();
}

function getClogItems() {
  if (!window.CLOG_DATA) return [];
  var items = window.CLOG_DATA;
  if (clogState.cat !== 'All') {
    items = items.filter(function(i) { return i.category === clogState.cat; });
  }
  return items;
}

function getClogSources() {
  var items = getClogItems();
  var seen = {};
  var sources = [];
  items.forEach(function(i) {
    if (!seen[i.source]) { seen[i.source] = true; sources.push(i.source); }
  });
  return sources; // preserve in-game order from CLOG_DATA sort field
}

function getSourceItems(source) {
  return getClogItems().filter(function(i) { return i.source === source; });
}

function isObtained(name) {
  return !!clogObtained[name.toLowerCase()];
}

function updateClogSummary() {
  // Total is 1698 unique clog slots (some share names e.g. Medallion fragment x8)
  var CLOG_TOTAL = 1698;
  var allItems = window.CLOG_DATA || [];
  // Dedupe by name for obtained count, but cap at total
  var uniqueNames = {};
  allItems.forEach(function(i) { uniqueNames[i.name.toLowerCase()] = true; });
  var got = Object.keys(uniqueNames).filter(function(n) { return isObtained(n); }).length;
  var el = document.getElementById('clog-summary');
  if (el) el.textContent = got + ' / ' + CLOG_TOTAL + ' obtained';
}

function renderClogSidebar() {
  var sidebar = document.getElementById('clog-sidebar');
  if (!sidebar || !window.CLOG_DATA) return;
  var sources = getClogSources();
  var html = '<button class="clog-src-btn' + (clogState.activeSource === null ? ' active' : '') + '" onclick="setClogSource(null)">Overview</button>';
  sources.forEach(function(src) {
    var srcItems = getSourceItems(src);
    var total = srcItems.length;
    var got = srcItems.filter(function(i) { return isObtained(i.name); }).length;
    var isDone = total > 0 && got === total;
    var isActive = clogState.activeSource === src;
    var label = src.length > 18 ? src.substring(0, 17) + '…' : src;
    html += '<button class="clog-src-btn' + (isDone ? ' src-done' : '') + (isActive ? ' active' : '') + '"' +
      ' onclick="setClogSource(\'' + src.replace(/'/g, "\\'") + '\')" title="' + src + '">' +
      '<span>' + label + '</span>' +
      '<span class="clog-src-count">' + got + '/' + total + '</span>' +
      '</button>';
  });
  sidebar.innerHTML = html;
}

function renderClogMain() {
  var main = document.getElementById('clog-main');
  if (!main || !window.CLOG_DATA) return;

  // No source selected — show overview grid of all sources in current category
  if (!clogState.activeSource) {
    renderClogOverview(main);
    return;
  }

  var search = (document.getElementById('clog-search') || {}).value || '';
  search = search.toLowerCase().trim();

  var source = clogState.activeSource;
  var items = getSourceItems(source);

  if (search) {
    items = items.filter(function(i) { return i.name.toLowerCase().indexOf(search) !== -1; });
  }
  if (clogState.filterObtained) {
    items = items.filter(function(i) { return isObtained(i.name); });
  }
  if (clogState.filterMissing) {
    items = items.filter(function(i) { return !isObtained(i.name); });
  }

  var allItems = getSourceItems(source);
  var total = allItems.length;
  var got = allItems.filter(function(i) { return isObtained(i.name); }).length;
  var pct = total > 0 ? Math.round((got / total) * 100) : 0;
  var progColor = pct === 100 ? '#3d9e3d' : pct >= 50 ? '#8a9e3d' : pct >= 25 ? '#c8a84b' : '#8b6030';

  var html = '<div style="margin-bottom:10px">' +
    '<button onclick="setClogSource(null)" style="background:none;border:none;color:var(--text-muted);font-family:\'Cinzel\',serif;font-size:0.7rem;letter-spacing:0.05em;cursor:pointer;padding:0;margin-bottom:10px;" ' +
    'onmouseover="this.style.color=\'var(--gold-light)\'" onmouseout="this.style.color=\'var(--text-muted)\'">' +
    '← Back to overview</button>' +
    '</div>' +
    '<div class="clog-src-header">' +
    '<span class="clog-src-title">' + source + '</span>' +
    '<span class="clog-src-meta">' + got + ' / ' + total + ' items</span>' +
    '</div>' +
    '<div class="clog-prog-bar"><div class="clog-prog-fill" style="width:' + pct + '%;background:' + progColor + '"></div></div>';

  if (!items.length) {
    html += '<div class="clog-empty">No items match your current filters.</div>';
  } else {
    html += '<div class="clog-item-grid">';
    items.forEach(function(item) {
      var obtained = isObtained(item.name);
      var iconName = item.name.replace(/ /g, '_').replace(/'/g, '%27');
      var iconUrl = 'https://oldschool.runescape.wiki/images/' + iconName + '.png';
      html += '<div class="clog-item-tile' + (obtained ? ' obtained' : '') + '" ' +
        'onclick="toggleClogItem(\'' + item.name.replace(/'/g, "\\'") + '\')" title="Click to toggle obtained">' +
        '<img class="clog-item-icon" src="' + iconUrl + '" alt="" onerror="this.style.display=\'none\'">' +
        '<span class="clog-item-name">' + item.name + '</span>' +
        '<span class="clog-item-hint">' + (obtained ? '✓ obtained' : '') + '</span>' +
        '</div>';
    });
    html += '</div>';
  }

  main.innerHTML = html;
}

function renderClogOverview(main) {
  var sources = getClogSources();
  if (!sources.length) {
    main.innerHTML = '<div class="clog-empty">No sources found.</div>';
    return;
  }

  var search = (document.getElementById('clog-search') || {}).value || '';
  search = search.toLowerCase().trim();
  if (search) {
    sources = sources.filter(function(s) { return s.toLowerCase().indexOf(search) !== -1; });
  }

  // Split into completed vs in-progress vs not-started
  var completed = [], inProgress = [], notStarted = [];
  sources.forEach(function(src) {
    var items = getSourceItems(src);
    var total = items.length;
    var got = items.filter(function(i) { return isObtained(i.name); }).length;
    if (total === 0) return;
    if (got === total) completed.push(src);
    else if (got > 0) inProgress.push(src);
    else notStarted.push(src);
  });

  var html = '';

  function renderSection(label, list) {
    if (!list.length) return;
    html += '<div class="clog-section-divider">' + label + '</div>';
    html += '<div class="clog-overview-grid">';
    list.forEach(function(src) {
      var items = getSourceItems(src);
      var total = items.length;
      var got = items.filter(function(i) { return isObtained(i.name); }).length;
      var pct = total > 0 ? Math.round((got / total) * 100) : 0;
      var progColor = pct === 100 ? '#3d9e3d' : pct >= 50 ? '#8a9e3d' : pct >= 25 ? '#c8a84b' : '#8b6030';
      var isDone = got === total && total > 0;
      html += '<div class="clog-overview-card' + (isDone ? ' ov-done' : '') + '" onclick="setClogSource(\'' + src.replace(/'/g, "\\'") + '\')">' +
        '<div class="clog-overview-name">' + src + '</div>' +
        '<div class="clog-overview-count">' + got + ' / ' + total + ' items</div>' +
        '<div class="clog-prog-bar" style="height:5px;margin-bottom:4px"><div class="clog-prog-fill" style="width:' + pct + '%;background:' + progColor + '"></div></div>' +
        '<div class="clog-overview-pct">' + pct + '%</div>' +
        '</div>';
    });
    html += '</div>';
  }

  if (inProgress.length) renderSection('In progress', inProgress);
  if (notStarted.length) renderSection('Not started', notStarted);
  if (completed.length) renderSection('Completed', completed);

  if (!html) html = '<div class="clog-empty">No sources match your search.</div>';
  main.innerHTML = html;
}

function setClogCat(cat, el) {
  clogState.cat = cat;
  clogState.activeSource = null; // always show overview on category change
  document.querySelectorAll('.clog-cat-tab').forEach(function(t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  var hashSuffix = cat === 'All' ? '' : '/' + cat.toLowerCase();
  history.replaceState(null, '', location.pathname + '#clog' + hashSuffix);
  renderClogSidebar();
  renderClogMain();
  updateClogSummary();
}

function setClogSource(source) {
  clogState.activeSource = source;
  // Close mobile sidebar
  var sidebar = document.getElementById('clog-sidebar');
  if (sidebar) sidebar.classList.remove('mob-open');
  var toggle = document.getElementById('clog-mob-toggle');
  if (toggle) toggle.textContent = '▼ Browse sources';
  renderClogSidebar();
  renderClogMain();
  // Scroll main panel to top
  var main = document.getElementById('clog-main');
  if (main) main.scrollTop = 0;
}

function toggleClogFilter(type) {
  if (type === 'obtained') {
    clogState.filterObtained = !clogState.filterObtained;
    if (clogState.filterObtained) clogState.filterMissing = false;
    document.getElementById('clog-f-missing').classList.remove('active');
    document.getElementById('clog-f-obtained').classList.toggle('active', clogState.filterObtained);
  } else {
    clogState.filterMissing = !clogState.filterMissing;
    if (clogState.filterMissing) clogState.filterObtained = false;
    document.getElementById('clog-f-obtained').classList.remove('active');
    document.getElementById('clog-f-missing').classList.toggle('active', clogState.filterMissing);
  }
  renderClogMain();
}

function toggleClogSidebar() {
  var sidebar = document.getElementById('clog-sidebar');
  var toggle = document.getElementById('clog-mob-toggle');
  if (!sidebar) return;
  var open = sidebar.classList.toggle('mob-open');
  if (toggle) toggle.textContent = open ? '▲ Hide sources' : '▼ Browse sources';
}

// ============================================================
// FRIEND / GROUP COMPARISON
// ============================================================

// OSRS in-game skill panel order (3-col grid, row by row)
const CMP_SKILL_ORDER = [
  'Attack',      'Hitpoints',    'Mining',
  'Strength',    'Agility',      'Smithing',
  'Defence',     'Herblore',     'Fishing',
  'Ranged',      'Thieving',     'Cooking',
  'Prayer',      'Crafting',     'Firemaking',
  'Magic',       'Fletching',    'Woodcutting',
  'Runecraft',   'Slayer',       'Farming',
  'Construction','Hunter',       'Sailing',
];

// Player slot colours — cycle through for bars/highlights
const CMP_COLORS = ['#7ab0f0','#6fc96f','#f0c858','#e07070','#c090ff','#90d8ff'];

// Isolated state — array of {id, rsn, stats, kc} | null per slot
var compareSlots = [];   // array of slot data (null = not yet loaded)
var compareSlotCount = 0; // ever-incrementing ID counter

// ── Pure helper functions (no globals read) ──────────────────

function cmpCombatLevel(s) {
  if (!s || !Object.keys(s).length) return 3;
  const def = s.defence || 1, hp = s.hitpoints || 10, pray = s.prayer || 1;
  const atk = s.attack || 1, str = s.strength || 1;
  const rng = s.ranged || 1, mag = s.magic || 1;
  return Math.floor(
    0.25 * (def + hp + Math.floor(pray / 2)) +
    Math.max(0.325 * (atk + str), 0.325 * Math.floor(rng * 1.5), 0.325 * Math.floor(mag * 1.5))
  );
}

function cmpTotalLevel(s) {
  if (!s) return 0;
  return SKILLS.reduce((sum, sk) => sum + (s[sk.name.toLowerCase()] || 1), 0);
}

function cmpUnlockCount(stats, tierMin, tierMax) {
  if (!stats || !Object.keys(stats).length) return 0;
  const cb = cmpCombatLevel(stats);
  const tot = cmpTotalLevel(stats);
  let count = 0;
  for (const item of SPINE_DATA) {
    if (item.order < tierMin || item.order > tierMax) continue;
    const reqs = parseSkillReqs(item.skillReqs);
    if (!reqs.length) { count++; continue; }
    let ok = true;
    for (const req of reqs) {
      if (req.isQP) continue;
      const key = req.skill.toLowerCase();
      const have = key === 'combat' ? cb : (key === 'total level' || key === 'total') ? tot : (stats[key] || 1);
      if (have < req.level) { ok = false; break; }
    }
    if (ok) count++;
  }
  return count;
}

// ── Slot DOM management ───────────────────────────────────────

function renderCompareSlotInputs() {
  const container = document.getElementById('cmp-slots');
  if (!container) return;
  const addBtn = document.getElementById('cmp-add-btn');
  if (addBtn) addBtn.style.display = compareSlotCount >= 6 ? 'none' : '';

  container.innerHTML = compareSlots.map((slot, idx) => {
    const canRemove = compareSlots.length > 2;
    return `<div class="cmp-slot" id="cmp-slot-${slot.id}">
      ${canRemove ? `<button class="cmp-slot-remove" onclick="removeCompareSlot(${slot.id})" title="Remove">✕</button>` : ''}
      <label>Player ${idx + 1}</label>
      <div class="cpi-row">
        <input type="text" id="cmp-rsn-${slot.id}" placeholder="Enter RSN…"
          value="${slot.rsn || ''}"
          onkeydown="if(event.key==='Enter') loadComparePlayer(${slot.id})">
        <button class="btn" onclick="loadComparePlayer(${slot.id})">Lookup</button>
        <button class="btn btn-ghost" onclick="loadCompareFromMyStats(${slot.id})" title="Use your currently loaded stats">Use Mine</button>
      </div>
      <div id="cmp-status-${slot.id}" class="compare-status ${slot.statusCls || ''}">${slot.statusMsg || ''}</div>
    </div>`;
  }).join('');
}

function addCompareSlot() {
  if (compareSlots.length >= 6) return;
  compareSlotCount++;
  compareSlots.push({ id: compareSlotCount, rsn: '', stats: null, kc: null, statusCls: '', statusMsg: '' });
  renderCompareSlotInputs();
}

function removeCompareSlot(id) {
  if (compareSlots.length <= 2) return;
  compareSlots = compareSlots.filter(s => s.id !== id);
  renderCompareSlotInputs();
  renderCompare();
}

function clearAllCompareSlots() {
  compareSlots = [];
  compareSlotCount = 0;
  // Re-initialise with two empty slots
  initCompareSlots();
  renderCompare();
}

function initCompareSlots() {
  compareSlots = [];
  compareSlotCount = 2;
  compareSlots.push({ id: 1, rsn: '', stats: null, kc: null, statusCls: '', statusMsg: '' });
  compareSlots.push({ id: 2, rsn: '', stats: null, kc: null, statusCls: '', statusMsg: '' });
  renderCompareSlotInputs();
}

// ── Hiscores fetch (unchanged, still isolated) ────────────────

async function fetchHiscoresForCompare(rsn) {
  const hiscoresUrl = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(rsn)}`;
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(hiscoresUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(hiscoresUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(hiscoresUrl)}`
  ];
  const skillMap = {
    'Attack':'attack','Defence':'defence','Strength':'strength','Hitpoints':'hitpoints',
    'Ranged':'ranged','Prayer':'prayer','Magic':'magic','Cooking':'cooking',
    'Woodcutting':'woodcutting','Fletching':'fletching','Fishing':'fishing',
    'Firemaking':'firemaking','Crafting':'crafting','Smithing':'smithing',
    'Mining':'mining','Herblore':'herblore','Agility':'agility','Thieving':'thieving',
    'Slayer':'slayer','Farming':'farming','Runecraft':'runecraft','Hunter':'hunter',
    'Construction':'construction','Sailing':'sailing'
  };
  for (const proxyUrl of proxies) {
    try {
      const resp = await fetch(proxyUrl);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data || (!data.skills && !data.activities)) continue;
      const stats = {};
      (data.skills || []).forEach(s => {
        const key = skillMap[s.name];
        if (key && s.level > 0) stats[key] = Math.max(1, s.level);
      });
      const kc = {};
      const spineNameMap = {};
      SPINE_DATA.forEach(item => {
        if (item.entryType === 'boss' || item.type === 'Boss') {
          spineNameMap[item.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = item.order;
        }
      });
      (data.activities || []).forEach(activity => {
        const score = activity.score;
        if (!score || score < 1) return;
        const norm = activity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (spineNameMap[norm] !== undefined) { kc[spineNameMap[norm]] = score; return; }
        for (const [spineName, order] of Object.entries(spineNameMap)) {
          if (norm.includes(spineName) || spineName.includes(norm)) { kc[order] = score; break; }
        }
      });
      return { stats, kc };
    } catch { /* try next */ }
  }
  throw new Error('Player not found or Hiscores unavailable');
}

async function loadComparePlayer(id) {
  const slot = compareSlots.find(s => s.id === id);
  if (!slot) return;
  const input = document.getElementById('cmp-rsn-' + id);
  const statusEl = document.getElementById('cmp-status-' + id);
  const rsn = input ? input.value.trim() : '';
  if (!rsn) return;
  slot.rsn = rsn;
  slot.stats = null; slot.kc = null;
  slot.statusCls = 'loading'; slot.statusMsg = '⏳ Looking up ' + rsn + '…';
  if (statusEl) { statusEl.className = 'compare-status loading'; statusEl.textContent = slot.statusMsg; }
  try {
    const result = await fetchHiscoresForCompare(rsn);
    slot.stats = result.stats;
    slot.kc = result.kc;
    slot.statusCls = 'success'; slot.statusMsg = '✓ Loaded ' + rsn;
    if (statusEl) { statusEl.className = 'compare-status success'; statusEl.textContent = slot.statusMsg; }
  } catch (e) {
    slot.statusCls = 'error'; slot.statusMsg = '✗ ' + e.message;
    if (statusEl) { statusEl.className = 'compare-status error'; statusEl.textContent = slot.statusMsg; }
  }
  renderCompare();
}

function loadCompareFromMyStats(id) {
  const slot = compareSlots.find(s => s.id === id);
  if (!slot) return;
  const statusEl = document.getElementById('cmp-status-' + id);
  const hasRealStats = playerStats && Object.values(playerStats).some(v => v > 1);
  if (!hasRealStats) {
    slot.statusCls = 'error'; slot.statusMsg = '✗ No stats loaded — use Lookup or enter stats manually first.';
    if (statusEl) { statusEl.className = 'compare-status error'; statusEl.textContent = slot.statusMsg; }
    return;
  }
  const rsnStatsEl = document.getElementById('rsn-input-stats');
  const rsnEl = document.getElementById('rsn-input');
  const rsn = (rsnStatsEl && rsnStatsEl.value.trim())
           || (rsnEl && rsnEl.value.trim())
           || 'You';
  slot.rsn = rsn;
  slot.stats = Object.assign({}, playerStats);
  slot.kc = Object.assign({}, bossKC);
  slot.statusCls = 'success'; slot.statusMsg = '✓ Using your current stats';
  const input = document.getElementById('cmp-rsn-' + id);
  if (input) input.value = rsn;
  if (statusEl) { statusEl.className = 'compare-status success'; statusEl.textContent = slot.statusMsg; }
  renderCompare();
}

// ── Render ────────────────────────────────────────────────────

function renderCompare() {
  const el = document.getElementById('compare-results');
  if (!el) return;

  const loaded = compareSlots.filter(s => s.stats !== null);

  if (loaded.length === 0) { el.innerHTML = ''; return; }
  if (loaded.length === 1) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;font-style:italic;padding:1rem 0">
      Loaded <strong style="color:var(--text-light)">${loaded[0].rsn}</strong>. Load at least one more player to compare.
    </p>`;
    return;
  }

  const tierColors = { early:'#6fc96f', mid:'#7ab0f0', late:'#e07070', end:'var(--gold)' };

  // ── Summary cards ─────────────────────────────────────────
  function summaryCards() {
    const maxTot = Math.max(...loaded.map(p => cmpTotalLevel(p.stats)));
    const maxCB  = Math.max(...loaded.map(p => cmpCombatLevel(p.stats)));
    const maxUnl = Math.max(...loaded.map(p => cmpUnlockCount(p.stats, 1, Infinity)));
    return loaded.map((p, i) => {
      const tot = cmpTotalLevel(p.stats);
      const cb  = cmpCombatLevel(p.stats);
      const unl = cmpUnlockCount(p.stats, 1, Infinity);
      return `<div class="cmp-summary-card">
        <div class="csn" style="border-left:3px solid ${CMP_COLORS[i % CMP_COLORS.length]};padding-left:0.5rem">${p.rsn}</div>
        <div class="cmp-stat-row"><span>Total Level</span><span class="val ${tot === maxTot ? 'win' : ''}">${tot.toLocaleString()}</span></div>
        <div class="cmp-stat-row"><span>Combat Level</span><span class="val ${cb === maxCB ? 'win' : ''}">${cb}</span></div>
        <div class="cmp-stat-row"><span>Entries Unlockable</span><span class="val ${unl === maxUnl ? 'win' : ''}">${unl}</span></div>
      </div>`;
    }).join('');
  }

  // ── Tier unlock bars ──────────────────────────────────────
  function tierSection() {
    return TIERS.map(t => {
      const total = SPINE_DATA.filter(i => i.order >= t.minOrder && i.order <= t.maxOrder).length;
      const bars = loaded.map((p, i) => {
        const u = cmpUnlockCount(p.stats, t.minOrder, t.maxOrder);
        const pct = total > 0 ? Math.round(u / total * 100) : 0;
        const col = CMP_COLORS[i % CMP_COLORS.length];
        return `<div class="cmp-tier-bar-row">
          <span class="pname" title="${p.rsn}">${p.rsn}</span>
          <div class="cmp-tier-bar-track"><div class="cmp-tier-bar-fill" style="width:${pct}%;background:${col}"></div></div>
          <span class="pct">${pct}%</span>
        </div>`;
      }).join('');
      return `<div class="cmp-tier-card">
        <div class="cmp-tier-label">${t.label}</div>
        <div class="cmp-tier-bars">${bars}</div>
      </div>`;
    }).join('');
  }

  // ── Skill grid (OSRS order) ───────────────────────────────
  function skillGrid() {
    // Build icon lookup from SKILLS array
    const iconMap = {};
    SKILLS.forEach(sk => { iconMap[sk.name] = sk.icon; });

    return CMP_SKILL_ORDER.map(skillName => {
      const key = skillName.toLowerCase();
      const vals = loaded.map(p => p.stats[key] || 1);
      const maxVal = Math.max(...vals);
      const minVal = Math.min(...vals);
      const valSpans = vals.map((v, i) => {
        const cls = vals.length > 1 ? (v === maxVal && maxVal !== minVal ? 'win' : v === minVal && maxVal !== minVal ? 'lose' : 'tie') : 'tie';
        return (i > 0 ? '<span class="sdiv">·</span>' : '') +
               `<span class="sv ${cls}">${v}</span>`;
      }).join('');
      return `<div class="cmp-skill-row">
        <img src="${iconMap[skillName] || ''}" alt="">
        <span class="sname">${skillName}</span>
        <div class="cmp-skill-vals">${valSpans}</div>
      </div>`;
    }).join('');
  }

  // ── Boss KC table ─────────────────────────────────────────
  function kcTable() {
    const bosses = SPINE_DATA.filter(i => i.type === 'Boss' || i.entryType === 'boss');
    const rows = bosses.filter(i => loaded.some(p => (p.kc[i.order] || 0) > 0));
    if (!rows.length) return '<p style="color:var(--text-muted);font-size:0.88rem;font-style:italic;padding:0.5rem 0">No boss KC found for any loaded player.</p>';
    rows.sort((x, y) => {
      const sumY = loaded.reduce((s, p) => s + (p.kc[y.order] || 0), 0);
      const sumX = loaded.reduce((s, p) => s + (p.kc[x.order] || 0), 0);
      return sumY - sumX;
    });
    const header = `<tr><th>Boss</th>${loaded.map(p => `<th>${p.rsn}</th>`).join('')}</tr>`;
    const body = rows.map(i => {
      const vals = loaded.map(p => p.kc[i.order] || 0);
      const maxKC = Math.max(...vals);
      const cells = vals.map((v, idx) => {
        const cls = v === maxKC && maxKC > 0 && vals.filter(x => x === maxKC).length < vals.length ? 'win'
                  : v < maxKC && maxKC > 0 && v > 0 ? 'lose' : '';
        return `<td class="${cls}">${v > 0 ? v.toLocaleString() : '—'}</td>`;
      }).join('');
      return `<tr><td>${i.name}</td>${cells}</tr>`;
    }).join('');
    return `<div class="cmp-kc-wrap" style="overflow-x:auto"><table class="cmp-kc-table"><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  }

  // ── Coming Soon section (plugin-gated) ────────────────────
  function comingSoonSection(title, ghostRowCount) {
    const ghostRows = Array(ghostRowCount).fill('<div class="cmp-ghost-row"></div>').join('');
    return `<div class="cmp-coming-soon-wrap">
      <div class="cmp-ghost-rows">${ghostRows}</div>
      <div class="cmp-coming-soon-overlay">
        <span class="cs-icon">🔌</span>
        <span class="cs-title">${title}</span>
        <span class="cs-sub">Requires the ProgressScape RuneLite plugin — coming once the plugin hub submission is approved.</span>
      </div>
    </div>`;
  }

  // ── Legend ────────────────────────────────────────────────
  const legend = loaded.map((p, i) =>
    `<span style="display:inline-flex;align-items:center;gap:0.3rem;margin-right:0.75rem">
      <span style="width:10px;height:10px;border-radius:2px;background:${CMP_COLORS[i % CMP_COLORS.length]};display:inline-block;flex-shrink:0"></span>
      <span style="font-size:0.82rem;color:var(--text-muted)">${p.rsn}</span>
    </span>`
  ).join('');

  el.innerHTML = `
    <div style="margin-bottom:1rem">${legend}</div>

    <div class="cmp-section-title">Overview</div>
    <div class="cmp-summary">${summaryCards()}</div>

    <div class="cmp-section-title">Content Unlockable by Tier
      <span style="font-weight:400;letter-spacing:0;text-transform:none;font-family:'Source Sans 3',sans-serif;font-size:0.78rem;color:var(--stone-lighter);margin-left:0.5rem">(skill reqs met, excl. QP &amp; quest prereqs)</span>
    </div>
    <div class="cmp-tier-grid">${tierSection()}</div>

    <div class="cmp-section-title">Skills</div>
    <div class="cmp-skills">${skillGrid()}</div>

    <div class="cmp-section-title">Boss Kill Count</div>
    ${kcTable()}

    <div class="cmp-section-title">Quest Completions</div>
    ${comingSoonSection('Quest Completion Data', 6)}

    <div class="cmp-section-title">Achievement Diaries</div>
    ${comingSoonSection('Diary Completion Data', 4)}

    <div class="cmp-section-title">Collection Log</div>
    ${comingSoonSection('Collection Log Data', 5)}
  `;
}

// Hook into showPage

// ============================================================
// BOSS TRACKER
// ============================================================

var btActiveFilter = 'all';

function setBtFilter(filter, el) {
  btActiveFilter = filter;
  document.querySelectorAll('[data-btfilter]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.btfilter === filter);
  });
  renderBossTracker();
}

function renderBossTracker() {
  var grid = document.getElementById('bt-grid');
  var summaryEl = document.getElementById('bt-summary');
  if (!grid) return;

  var search = (document.getElementById('bt-search') || {}).value || '';
  search = search.toLowerCase().trim();

  var bosses = SPINE_DATA.filter(function(item) {
    if (item.type !== 'Boss' && item.entryType !== 'boss') return false;
    if (btActiveFilter !== 'all') {
      var tierClass = (item.bossTier || '').toLowerCase().replace(' tier', '').trim();
      if (tierClass !== btActiveFilter) return false;
    }
    if (search && item.name.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  var totalKC   = bosses.reduce(function(s, b) { return s + (bossKC[b.order] || 0); }, 0);
  var doneCount = bosses.filter(function(b) { return completedSet.has(b.order); }).length;
  if (summaryEl) {
    summaryEl.textContent = bosses.length + ' bosses  ·  ' +
      doneCount + ' completed  ·  ' +
      totalKC.toLocaleString() + ' total KC';
  }

  if (!bosses.length) {
    grid.innerHTML = '<div class="bt-empty">No bosses match your filters.</div>';
    return;
  }

  grid.innerHTML = bosses.map(function(boss) {
    return buildBossCardHtml(boss);
  }).join('');
}

function buildBossCardHtml(boss) {
  var drops = boss.notableDrops || [];
  var totalDrops = drops.length;
  var doneDrops = drops.filter(function(d) {
    return !!obtainedDrops[boss.order + '-' + d[0]];
  }).length;
  var allDone = totalDrops > 0 && doneDrops === totalDrops;
  var kc = bossKC[boss.order] || 0;

  var tierClass = (boss.bossTier || '').toLowerCase().replace(' tier', '').trim();
  var tierHtml = boss.bossTier
    ? '<span class="boss-tier tier-' + tierClass + '" style="font-size:0.68rem">' + boss.bossTier + '</span>'
    : '';

  var cardClass = 'boss-card' + (allDone ? ' bc-all-done' : '');

  var pct = totalDrops > 0 ? Math.round(doneDrops / totalDrops * 100) : 0;
  var progressHtml = totalDrops > 0
    ? '<div class="bc-progress-row">' +
        '<div class="bc-progress-track">' +
          '<div class="bc-progress-fill' + (allDone ? ' done' : '') +
            '" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<span class="bc-progress-label">' + doneDrops + ' / ' + totalDrops + ' drops</span>' +
      '</div>'
    : '';

  var dropsHtml = drops.map(function(drop) {
    var dropName = drop[0], dropRate = drop[1], itemId = drop[2];
    var dropKey = boss.order + '-' + dropName;
    var done = !!obtainedDrops[dropKey];
    var price = gePrice(itemId, 'short');
    var priceHtml = price ? '<span class="bc-drop-price">' + price + '</span>' : '';
    return '<div class="bc-drop-row' + (done ? ' bc-drop-done' : '') + '"' +
      ' onclick="toggleDropDone(\'' + dropKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', ' + boss.order + ', null)">' +
      '<div class="bc-drop-check">' + (done ? '✓' : '') + '</div>' +
      '<span class="bc-drop-name" title="' + dropName.replace(/"/g, '&quot;') + '">' + dropName + '</span>' +
      '<span class="bc-drop-rate">' + dropRate + '</span>' +
      priceHtml +
      '</div>';
  }).join('');

  // CA row
  var caTasks = getCaTasksForBoss(boss.name);
  var caTotal = caTasks.length;
  var caDone = caTasks.filter(function(t) { return caCompleted[t.id]; }).length;
  var caAllDone = caTotal > 0 && caDone === caTotal;
  var caPct = caTotal > 0 ? Math.round(caDone / caTotal * 100) : 0;
  var caRowHtml = caTotal > 0
    ? '<div class="bc-ca-row">' +
        '<span class="bc-ca-label">COMBAT TASKS</span>' +
        '<div class="bc-ca-bar"><div class="bc-ca-fill" style="width:' + caPct + '%"></div></div>' +
        '<span class="bc-ca-count' + (caAllDone ? ' done' : '') + '">' + caDone + '/' + caTotal + '</span>' +
      '</div>'
    : '';

  return '<div class="' + cardClass + '" id="bc-' + boss.order + '">' +
    '<div class="bc-header">' +
      '<span class="bc-name" onclick="openDetail(' + boss.order + ')" title="Open details">' +
        boss.name + (tierHtml ? '&ensp;' + tierHtml : '') +
      '</span>' +
      '<div class="bc-kc-wrap">' +
        '<span class="bc-kc-label">KC</span>' +
        '<input class="bc-kc-input" type="number" min="0" value="' + kc + '"' +
          ' onchange="updateKC(' + boss.order + ', this.value)"' +
          ' oninput="updateKC(' + boss.order + ', this.value)"' +
          ' onclick="event.stopPropagation()">' +
      '</div>' +
    '</div>' +
    progressHtml +
    (dropsHtml ? '<div class="bc-drops">' + dropsHtml + '</div>' : '') +
    caRowHtml +
    '</div>';
}

function refreshBossCard(order) {
  var el = document.getElementById('bc-' + order);
  if (!el) return;
  var boss = SPINE_DATA.find(function(d) { return d.order === order; });
  if (!boss) return;
  var tmp = document.createElement('div');
  tmp.innerHTML = buildBossCardHtml(boss);
  el.parentNode.replaceChild(tmp.firstChild, el);
  // Update summary counts
  var summaryEl = document.getElementById('bt-summary');
  if (summaryEl) {
    var allBosses = SPINE_DATA.filter(function(i) { return i.type === 'Boss' || i.entryType === 'boss'; });
    var doneCount = allBosses.filter(function(b) { return completedSet.has(b.order); }).length;
    var totalKC   = allBosses.reduce(function(s, b) { return s + (bossKC[b.order] || 0); }, 0);
    summaryEl.textContent = allBosses.length + ' bosses  ·  ' +
      doneCount + ' completed  ·  ' +
      totalKC.toLocaleString() + ' total KC';
  }
}

// Hash-based page routing removed — each page is now a standalone HTML file.



(function() {
  var spCurrent = 0;
  var spTotal = 4;

  function spInit() {
    var overlay = document.getElementById('splash-overlay');
    if (!overlay) return;
    if (!localStorage.getItem('progressscape_welcomed')) {
      overlay.style.display = 'flex';
    }
  }

  window.spShowTab = function(i) {
    spCurrent = i;
    document.querySelectorAll('.sp-panel').forEach(function(p,idx){ p.classList.toggle('sp-active', idx===i); });
    document.querySelectorAll('.sp-tab').forEach(function(t,idx){ t.classList.toggle('sp-active', idx===i); });
    document.querySelectorAll('.sp-dot').forEach(function(d,idx){ d.classList.toggle('sp-active', idx===i); });
    document.getElementById('sp-next-btn').innerHTML = i === spTotal-1 ? 'Enter the World ✓' : 'Next &rarr;';
  };

  window.spNext = function() {
    if (spCurrent < spTotal - 1) {
      spShowTab(spCurrent + 1);
    } else {
      spDismiss(false);
    }
  };

  window.spDismiss = function(permanent) {
    if (permanent) localStorage.setItem('progressscape_welcomed', '1');
    var overlay = document.getElementById('splash-overlay');
    if (overlay) overlay.style.display = 'none';
  };

  // Close on overlay click (outside modal)
  var splashOverlay = document.getElementById('splash-overlay');
  if (splashOverlay) {
    splashOverlay.addEventListener('click', function(e) {
      if (e.target === this) spDismiss(false);
    });
  }

  // Run after page init so SPINE_DATA is available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', spInit);
  } else {
    spInit();
  }
})();

// ============================================================
// COMBAT ACHIEVEMENTS
// ============================================================
var caCompleted = {};
var caActiveTier = 'All';
var caHideDone = false;
var caOverviewCollapsed = false;

var CA_REWARDS = [
  { pts: 41,   label: "Hilt 1" },
  { pts: 161,  label: "Hilt 2" },
  { pts: 416,  label: "Hilt 3" },
  { pts: 1064, label: "Hilt 4" },
  { pts: 1904, label: "Hilt 5" },
  { pts: 2630, label: "Hilt 6" }
];

var CA_TIERS = ['Easy','Medium','Hard','Elite','Master','Grandmaster'];
var CA_TOTAL_PTS = 2630;

function loadCaStorage() {
  try {
    var s = localStorage.getItem('osrs_ca_completed');
    if (s) caCompleted = JSON.parse(s);
  } catch(e) { caCompleted = {}; }
  try {
    var c = localStorage.getItem('osrs_ca_overview_collapsed');
    if (c !== null) caOverviewCollapsed = JSON.parse(c);
  } catch(e) {}
  try {
    var hd = localStorage.getItem('osrs_ca_hide_done');
    if (hd !== null) caHideDone = JSON.parse(hd);
  } catch(e) {}
}

function saveCaStorage() {
  localStorage.setItem('osrs_ca_completed', JSON.stringify(caCompleted));
}

function getCaPoints() {
  if (typeof CA_DATA === 'undefined') return 0;
  return CA_DATA.reduce(function(sum, t) {
    return sum + (caCompleted[t.id] ? t.points : 0);
  }, 0);
}

function getCaTierStats() {
  var stats = {};
  CA_TIERS.forEach(function(tier) {
    stats[tier] = { total: 0, done: 0, pts: 0, donePts: 0 };
  });
  if (typeof CA_DATA === 'undefined') return stats;
  CA_DATA.forEach(function(t) {
    if (!stats[t.tier]) return;
    stats[t.tier].total++;
    stats[t.tier].pts += t.points;
    if (caCompleted[t.id]) { stats[t.tier].done++; stats[t.tier].donePts += t.points; }
  });
  return stats;
}

function toggleCaOverview() {
  caOverviewCollapsed = !caOverviewCollapsed;
  localStorage.setItem('osrs_ca_overview_collapsed', JSON.stringify(caOverviewCollapsed));
  applyCAOverviewState();
}

function applyCAOverviewState() {
  var panel = document.getElementById('ca-overview-panel');
  var chevron = document.getElementById('ca-chevron');
  if (!panel) return;
  panel.style.display = caOverviewCollapsed ? 'none' : '';
  if (chevron) chevron.classList.toggle('collapsed', caOverviewCollapsed);
}

function toggleCaHideDone() {
  caHideDone = !caHideDone;
  localStorage.setItem('osrs_ca_hide_done', JSON.stringify(caHideDone));
  var btn = document.getElementById('ca-hide-done-btn');
  if (btn) btn.classList.toggle('active', caHideDone);
  renderCaTaskList();
}

function setCaTier(tier) {
  caActiveTier = tier;
  document.querySelectorAll('.ca-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tier === tier);
  });
  // sync tier card active state
  document.querySelectorAll('.ca-tier-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.tier === tier);
  });
  renderCaTaskList();
  renderCaTierSummary();
}

function renderCaPage() {
  if (typeof CA_DATA === 'undefined') return;
  loadCaStorage();
  applyCAOverviewState();
  var btn = document.getElementById('ca-hide-done-btn');
  if (btn) btn.classList.toggle('active', caHideDone);
  renderCaOverview();
  renderCaTabs();
  renderCaTaskList();
  renderCaTierSummary();
}

function renderCaOverview() {
  var pts = getCaPoints();
  var tierStats = getCaTierStats();

  // Points summary in toggle header
  var nextReward = CA_REWARDS.find(function(r) { return pts < r.pts; });
  var summaryEl = document.getElementById('ca-pts-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '<strong>' + pts.toLocaleString() + '</strong> / ' +
      CA_TOTAL_PTS.toLocaleString() + ' pts' +
      (nextReward ? ' &nbsp;·&nbsp; next unlock in <strong>' + (nextReward.pts - pts).toLocaleString() + ' pts</strong>' : '');
  }

  // Bar
  // Segment-based fill: bar divided into equal segments between reward thresholds
  // so dots (evenly spaced) and fill always align
  var allPts = [0].concat(CA_REWARDS.map(function(r) { return r.pts; }));
  var segCount = CA_REWARDS.length; // number of segments
  var fillPct = 0;
  for (var si = 0; si < segCount; si++) {
    var segStart = allPts[si];
    var segEnd   = allPts[si + 1];
    if (pts >= segEnd) {
      fillPct = (si + 1) / segCount * 100;
    } else if (pts >= segStart) {
      var segProgress = (pts - segStart) / (segEnd - segStart);
      fillPct = (si + segProgress) / segCount * 100;
      break;
    }
  }
  fillPct = Math.min(100, Math.round(fillPct * 10) / 10);
  var fillEl = document.getElementById('ca-reward-fill');
  if (fillEl) fillEl.style.width = fillPct + '%';
  var barLabel = document.getElementById('ca-bar-label');
  if (barLabel) barLabel.textContent = pts.toLocaleString() + ' / ' + CA_TOTAL_PTS.toLocaleString();

  // Milestones
  var msEl = document.getElementById('ca-milestones');
  if (msEl) {
    var segCount = CA_REWARDS.length;
    msEl.innerHTML = CA_REWARDS.map(function(r, idx) {
      var reached = pts >= r.pts;
      var isNext = !reached && nextReward && r.pts === nextReward.pts;
      var leftPct = Math.round((idx + 1) / segCount * 1000) / 10; // e.g. 16.7%, 33.3%...100%
      return '<div class="ca-milestone" style="left:' + leftPct + '%">' +
        '<div class="ca-m-dot' + (reached ? ' reached' : isNext ? ' next' : '') + '"></div>' +
        '<div class="ca-m-label' + (reached ? ' reached' : isNext ? ' next' : '') + '">' +
          r.label + '<br>' + r.pts.toLocaleString() +
        '</div></div>';
    }).join('');
  }

  // Tier grid
  var tierGrid = document.getElementById('ca-tier-grid');
  if (tierGrid) {
    tierGrid.innerHTML = CA_TIERS.map(function(tier) {
      var s = tierStats[tier];
      var pct = s.total > 0 ? Math.round(s.done / s.total * 100) : 0;
      var tierKey = tier === 'Grandmaster' ? 'gm' : tier.toLowerCase();
      var isActive = caActiveTier === tier;
      return '<div class="ca-tier-card' + (isActive ? ' active' : '') + '" data-tier="' + tier + '" onclick="setCaTier(\'' + tier + '\')">' +
        '<div class="ca-tier-card-header">' +
          '<span class="ca-tier-name ' + tierKey + '">' + tier + '</span>' +
          '<span class="ca-tier-pts">' + s.donePts + ' pts</span>' +
        '</div>' +
        '<div class="ca-tier-counts">' + s.done + '<span> / ' + s.total + '</span></div>' +
        '<div class="ca-tier-bar-track"><div class="ca-tier-bar-fill fill-' + tierKey + '" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('');
  }

  // Combat profile
  var profileEl = document.getElementById('ca-profile-card');
  if (profileEl) {
    var totalTasks = CA_DATA.length;
    var doneTasks = Object.keys(caCompleted).filter(function(k) { return caCompleted[k]; }).length;
    var profileRows = [
      ['Tasks completed', doneTasks.toLocaleString()],
      ['Total possible', totalTasks.toLocaleString()],
    ];
    // Pull from hiscores data if available
    if (typeof playerStats !== 'undefined' && Object.keys(playerStats).length > 0) {
      var topBoss = null, topKC = 0;
      SPINE_DATA.forEach(function(item) {
        if ((item.type === 'Boss' || item.entryType === 'boss') && bossKC[item.order] > topKC) {
          topKC = bossKC[item.order];
          topBoss = item.name;
        }
      });
      var totalKC = Object.values(bossKC).reduce(function(s, v) { return s + (v || 0); }, 0);
      profileRows.push(['Boss kill count', totalKC.toLocaleString()]);
      if (topBoss) profileRows.push(['Top boss', '<div class="ca-profile-val">' + topBoss + '</div><div class="ca-profile-sub">' + topKC.toLocaleString() + ' kc</div>']);
    } else {
      profileRows.push(['Boss kill count', '<span class="muted">— link RSN —</span>']);
      profileRows.push(['Top boss', '<span class="muted">— link RSN —</span>']);
    }
    profileEl.innerHTML = profileRows.map(function(r) {
      return '<div class="ca-profile-row">' +
        '<span class="ca-profile-key">' + r[0] + '</span>' +
        '<span class="ca-profile-val">' + r[1] + '</span>' +
      '</div>';
    }).join('');
  }
}

function renderCaTabs() {
  var tabBar = document.getElementById('ca-tab-bar');
  if (!tabBar || typeof CA_DATA === 'undefined') return;
  var tierStats = getCaTierStats();
  var totalDone = CA_DATA.filter(function(t) { return caCompleted[t.id]; }).length;
  var allTab = '<button class="ca-tab' + (caActiveTier === 'All' ? ' active' : '') + '" data-tier="All" onclick="setCaTier(\'All\')">' +
    'All <span class="ca-tab-n">' + totalDone + '/' + CA_DATA.length + '</span>' +
  '</button>';
  tabBar.innerHTML = allTab + CA_TIERS.map(function(tier) {
    var s = tierStats[tier];
    var isActive = caActiveTier === tier;
    return '<button class="ca-tab' + (isActive ? ' active' : '') + '" data-tier="' + tier + '" onclick="setCaTier(\'' + tier + '\')">' +
      tier + ' <span class="ca-tab-n">' + s.done + '/' + s.total + '</span>' +
    '</button>';
  }).join('');
}

function renderCaTierSummary() {
  var el = document.getElementById('ca-tier-summary');
  if (!el || typeof CA_DATA === 'undefined') return;
  var tierStats = getCaTierStats();
  var summary;
  if (caActiveTier === 'All') {
    var allDone = CA_DATA.filter(function(t) { return caCompleted[t.id]; }).length;
    var allPts = CA_DATA.reduce(function(s,t) { return s + (caCompleted[t.id] ? t.points : 0); }, 0);
    summary = { done: allDone, total: CA_DATA.length, donePts: allPts, pts: 2630 };
  } else {
    summary = tierStats[caActiveTier];
  }
  if (!summary) return;
  el.innerHTML =
    '<span><strong>' + summary.done + '/' + summary.total + '</strong> tasks done</span>' +
    '<span><strong>' + summary.donePts + '/' + summary.pts + '</strong> pts earned</span>' +
    '<span style="color:var(--gold-dark)"><strong>' + (summary.total - summary.done) + '</strong> remaining</span>';
}

function renderCaTaskList() {
  var container = document.getElementById('ca-task-list');
  if (!container || typeof CA_DATA === 'undefined') return;

  var search = (document.getElementById('ca-search') || {}).value || '';
  search = search.toLowerCase().trim();
  var typeFilter = (document.getElementById('ca-type-filter') || {}).value || '';

  var tasks = CA_DATA.filter(function(t) {
    if (caActiveTier !== 'All' && t.tier !== caActiveTier) return false;
    if (typeFilter && t.type !== typeFilter) return false;
    if (caHideDone && caCompleted[t.id]) return false;
    if (search && t.name.toLowerCase().indexOf(search) === -1 &&
        t.boss.toLowerCase().indexOf(search) === -1 &&
        t.description.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  if (!tasks.length) {
    container.innerHTML = '<div class="ca-empty">No tasks match your filters.</div>';
    return;
  }

  // Group by boss
  var groups = {};
  var groupOrder = [];
  tasks.forEach(function(t) {
    var key = t.boss || 'Other';
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(t);
  });

  container.innerHTML = groupOrder.map(function(boss) {
    var bTasks = groups[boss];
    var totalForBoss = CA_DATA.filter(function(t) { return t.boss === boss && (caActiveTier === 'All' || t.tier === caActiveTier); }).length;
    var doneForBoss = CA_DATA.filter(function(t) { return t.boss === boss && (caActiveTier === 'All' || t.tier === caActiveTier) && caCompleted[t.id]; }).length;
    var bPct = totalForBoss > 0 ? Math.round(doneForBoss / totalForBoss * 100) : 0;
    var allBossDone = doneForBoss === totalForBoss && totalForBoss > 0;

    var tasksHtml = bTasks.map(function(t) {
      var done = !!caCompleted[t.id];
      var typeKey = t.type.toLowerCase().replace(' ', '-').replace(' count','').replace('kill-','kc').replace('mechanical','mech').replace('restriction','restrict').replace('perfection','perf').replace('stamina','stam').replace('speed','speed');
      // normalise type class
      var typeClassMap = {
        'Kill Count': 'kc', 'Mechanical': 'mech', 'Speed': 'speed',
        'Restriction': 'restrict', 'Perfection': 'perf', 'Stamina': 'stam'
      };
      var typeClass = 'ca-type-' + (typeClassMap[t.type] || 'kc');
      var tierKey = t.tier === 'Grandmaster' ? 'gm' : t.tier.toLowerCase();
      return '<div class="ca-task-row' + (done ? ' done' : '') + '">' +
        '<div class="ca-task-check' + (done ? ' done' : '') + '" onclick="toggleCaTask(\'' + t.id + '\')">' + (done ? '✓' : '') + '</div>' +
        '<div class="ca-task-info">' +
          '<div class="ca-task-name' + (done ? ' done' : '') + '">' + t.name + '</div>' +
          '<div class="ca-task-desc">' + t.description + '</div>' +
        '</div>' +
        '<div class="ca-task-right">' +
          '<span class="ca-type-badge ' + typeClass + '">' + t.type + '</span>' +
          '<span class="ca-task-tier-badge ' + tierKey + '">' + t.tier + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="ca-boss-group">' +
      '<div class="ca-boss-hdr">' +
        '<span class="ca-boss-name">' + boss + '</span>' +
        '<div class="ca-boss-right">' +
          '<div class="ca-boss-mini-bar"><div class="ca-boss-mini-fill' + (allBossDone ? ' done' : '') + '" style="width:' + bPct + '%"></div></div>' +
          '<span class="ca-boss-count' + (allBossDone ? ' done' : '') + '">' + doneForBoss + '/' + totalForBoss + '</span>' +
        '</div>' +
      '</div>' +
      tasksHtml +
    '</div>';
  }).join('');
}

function toggleCaTask(id) {
  if (caCompleted[id]) {
    delete caCompleted[id];
  } else {
    caCompleted[id] = true;
  }
  saveCaStorage();
  renderCaPage();
}

// Helper: get CA tasks for a given spineMatch name
function getCaTasksForBoss(spineName) {
  if (typeof CA_DATA === 'undefined') return [];
  return CA_DATA.filter(function(t) { return t.spineMatch === spineName; });
}

