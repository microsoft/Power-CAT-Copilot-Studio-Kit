// Global UI state: current layout, canvas cards, filters, cached datasets.

import { create } from 'zustand';
import type {
  AgentOption, AppView, CardInstance, DashboardLayout, DrillInRequest, FilterState, MetricDataset, MetricDefinition,
  ScenarioInputs, UserInfo, VisualizationType,
} from '../types';
import { metricService } from '../services/metricService';
import { layoutService } from '../services/layoutService';
import { buildDefaultCards } from '../services/defaultDashboard';
import { loadAgentOptions } from '../services/agentConfigService';
import { initUserContext } from '../services/userContextService';

interface AppState {
  // Bootstrap
  initialized: boolean;
  loading: boolean;
  bootstrapping: boolean;
  bootstrapMessage?: string;
  firstRunBootstrap: boolean;
  errorMsg?: string;

  // Data
  userInfo?: UserInfo;
  metrics: MetricDefinition[];
  layouts: DashboardLayout[];
  agents: AgentOption[];
  agentsLoading: boolean;

  // Current view
  view: AppView;
  currentLayout: DashboardLayout;
  filters: FilterState;
  datasets: Record<string, MetricDataset>;     // keyed by metricId
  loadingDatasets: Record<string, boolean>;

  // Sidebar
  sidebarCollapsed: boolean;
  forecastSidebarCollapsed: boolean;

  // Dashboard save state
  layoutDirty: boolean;
  lastAddedCardId: string | null;

  // Predictive panel
  predictivePanelOpen: boolean;
  predictiveMetricId?: string;
  predictiveMetricLocked: boolean;
  scenarioInputs: ScenarioInputs;

  // Drill-in side panel
  drillIn?: DrillInRequest;

  // Actions
  init: () => Promise<void>;
  setView: (v: AppView) => void;
  setFilters: (f: Partial<FilterState>) => void;
  addCard: (metricId: string) => void;
  clearLastAddedCard: () => void;
  moveCard: (instanceId: string, x: number, y: number) => void;
  resizeCard: (instanceId: string, w: number, h: number) => void;
  applyLayoutDelta: (items: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>) => void;
  removeCard: (instanceId: string) => void;
  setCardViz: (instanceId: string, viz?: VisualizationType) => void;
  resetLayout: () => void;
  loadDataset: (metricId: string, force?: boolean) => Promise<void>;
  saveLayout: (name?: string) => Promise<{ ok: boolean; reason?: string }>;
  loadLayout: (id: string) => void;
  newLayout: () => void;
  deleteLayout: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  renameLayout: (id: string, newName: string) => Promise<{ ok: boolean; reason?: string }>;
  openPredictive: (metricId?: string) => void;
  closePredictive: () => void;
  setScenario: (s: Partial<ScenarioInputs>) => void;
  openDrillIn: (req: DrillInRequest) => void;
  closeDrillIn: () => void;
  toggleSidebar: () => void;
  toggleForecastSidebar: () => void;
  loadAgents: () => Promise<void>;
}

function uniqueDashboardName(base: string, existing: DashboardLayout[], excludeId?: string): string {
  const taken = new Set(
    existing.filter(l => l.id !== excludeId).map(l => l.name.trim().toLowerCase()),
  );
  const name = base.trim() || 'Untitled dashboard';
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} ${Date.now()}`;
}

const defaultLayout = (existing: DashboardLayout[] = []): DashboardLayout => ({
  name: uniqueDashboardName('Untitled dashboard', existing),
  cards: [],
  scope: 'Personal',
});

const defaultFilters = (): FilterState => ({
  agentIds: [],
  timeRange: { preset: '30d' },
  channels: [],
  locales: [],
  dataMode: 'both',
});

const defaultScenario = (): ScenarioInputs => ({
  adoptionLiftPct: 0,
  containmentLiftPct: 0,
  volumeDeltaPct: 0,
});

// Minimum card dimensions for user-resizable cards. Arrange and addCard use h=6
// (480px) for comfortable chart rendering; MIN_CARD_H=5 is the manual-resize floor.
const MIN_CARD_W = 4;
const MIN_CARD_H = 5;
const GRID_COLS = 12;

/**
 * Normalizes card dimensions to enforce minimum sizes and resolve collisions.
 * Cards below MIN_CARD_W/MIN_CARD_H are expanded; x is clamped to stay in-grid;
 * overlapping cards are shifted downward.
 */
function normalizeLayoutCards(cards: CardInstance[]): CardInstance[] {
  // First pass: enforce minimums and clamp x
  const sized = cards.map(c => {
    const w = Math.max(c.w, MIN_CARD_W);
    const h = Math.max(c.h, MIN_CARD_H);
    const x = Math.min(Math.max(0, c.x), GRID_COLS - w);
    return { ...c, w, h, x, y: Math.max(0, c.y) };
  });

  // Second pass: resolve collisions by shifting overlapping cards downward
  const placed: CardInstance[] = [];
  // Sort by y then x to preserve rough layout order
  const sorted = [...sized].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const card of sorted) {
    const { x, w, h } = card;
    let { y } = card;
    // Find first y where this card doesn't collide with already-placed cards
    let collides = true;
    while (collides) {
      collides = placed.some(p =>
        x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y
      );
      if (collides) y++;
    }
    placed.push({ ...card, x, y, w, h });
  }
  return placed;
}

function newInstanceId(): string {
  return 'c_' + Math.random().toString(36).slice(2, 10);
}


export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  loading: false,
  bootstrapping: false,
  firstRunBootstrap: false,
  metrics: [],
  layouts: [],
  agents: [],
  agentsLoading: false,
  view: 'dashboard',
  currentLayout: defaultLayout(),
  filters: defaultFilters(),
  datasets: {},
  loadingDatasets: {},
  sidebarCollapsed: false,
  forecastSidebarCollapsed: false,
  layoutDirty: false,
  lastAddedCardId: null,
  predictivePanelOpen: false,
  predictiveMetricLocked: false,
  scenarioInputs: defaultScenario(),

  async init() {
    // Concurrency guard: if already initialized or another init is in progress, bail.
    if (get().initialized) {
      console.log('[AMS:init] Already initialized — skipping');
      return;
    }
    if (get().loading) {
      console.log('[AMS:init] Init already in progress (loading=true) — skipping concurrent call');
      return;
    }
    set({ loading: true, errorMsg: undefined });
    console.log('[AMS:init] Starting initialization…');

    // Load agents in parallel (non-blocking — dashboard renders without waiting)
    get().loadAgents();
    try {
      // Resolve current user context before loading data (owner filter depends on it)
      const userInfo = await initUserContext();
      if (userInfo) set({ userInfo });

      // If user context failed, do NOT bootstrap — fail-closed
      if (!userInfo) {
        console.error('[AMS:init] User context resolution failed — cannot determine owner. Showing empty state (fail-closed).');
        set({
          initialized: true,
          loading: false,
          metrics: [],
          layouts: [],
          currentLayout: defaultLayout(),
          filters: defaultFilters(),
          view: 'metric-registry',
        });
        return;
      }

      // Load metrics and layouts — errors propagate (no silent [] on failure)
      let metrics: MetricDefinition[];
      let layouts: DashboardLayout[];
      let metricsLoadOk = false;
      let layoutsLoadOk = false;
      try {
        [metrics, layouts] = await Promise.all([
          metricService.listMetrics().then(m => { metricsLoadOk = true; return m; }),
          layoutService.list().then(l => { layoutsLoadOk = true; return l; }),
        ]);
      } catch (e) {
        console.error('[AMS:init] Failed to load metrics or layouts from Dataverse', e);
        set({ errorMsg: `Failed to load data: ${(e as Error).message}`, loading: false, initialized: true, bootstrapping: false, bootstrapMessage: undefined });
        return;
      }

      console.log(`[AMS:init] Loaded: ${metrics.length} metrics (ok=${metricsLoadOk}), ${layouts.length} layouts (ok=${layoutsLoadOk})`);


      // First-run bootstrap: no metrics exist → auto-seed recommended metrics + default dashboard
      // ONLY proceed if reads succeeded AND returned genuinely empty
      if (metrics.length === 0 && metricsLoadOk && layoutsLoadOk) {
        console.info('[AMS:init] ✨ First-run detected (0 metrics, reads succeeded) — bootstrapping default dashboard…');
        set({ bootstrapping: true, bootstrapMessage: 'Getting things ready…' });
        try {
          set({ bootstrapMessage: 'Creating recommended metrics…' });
          console.log('[AMS:init] Calling ensureRecommendedMetrics()…');
          const { keyToId, metrics: freshMetrics } = await metricService.ensureRecommendedMetrics();
          console.log(`[AMS:init] ensureRecommendedMetrics() returned ${keyToId.size} keys, ${freshMetrics.length} metrics`);

          set({ bootstrapMessage: 'Building default dashboard…' });
          const cards = buildDefaultCards(keyToId);
          console.log(`[AMS:init] buildDefaultCards() produced ${cards.length} cards`);

          const overviewLayout: DashboardLayout = {
            name: 'Overview',
            cards,
            scope: 'Personal',
            isDefault: true,
          };

          // Check if an Overview layout already exists (idempotency guard)
          const existingOverview = await layoutService.findByName('Overview');
          let layoutId: string | undefined;
          let layoutSaved = false;

          if (existingOverview?.id) {
            console.log(`[AMS:init] Overview layout already exists (id=${existingOverview.id}) — updating instead of creating`);
            layoutId = existingOverview.id;
            try {
              set({ bootstrapMessage: 'Saving dashboard layout…' });
              await layoutService.save({ ...overviewLayout, id: layoutId });
              layoutSaved = true;
            } catch (e) {
              console.warn('[AMS:init] ⚠️ Update of existing Overview failed — using in-memory', e);
            }
          } else {
            // Attempt to persist the layout with pre-generated ID (avoids re-query)
            layoutId = crypto.randomUUID();
            try {
              set({ bootstrapMessage: 'Saving dashboard layout…' });
              console.log(`[AMS:init] Saving overview layout to Dataverse with pre-generated ID: ${layoutId}`);
              await layoutService.save({ ...overviewLayout, _preId: layoutId } as DashboardLayout & { _preId: string });
              layoutSaved = true;
              console.log(`[AMS:init] Layout saved with pre-generated ID: ${layoutId}`);
            } catch (e) {
              console.warn('[AMS:init] ⚠️ Default layout save failed — showing in-memory', e);
              layoutId = undefined;
            }
          }

          const finalLayout: DashboardLayout = {
            ...overviewLayout,
            id: layoutSaved ? layoutId : undefined,
          };
          console.log(`[AMS:init] ✅ Bootstrap complete. Dashboard "${finalLayout.name}" with ${finalLayout.cards.length} cards.`);
          set({
            metrics: freshMetrics,
            layouts: layoutSaved ? [finalLayout] : [],
            currentLayout: finalLayout,
            filters: defaultFilters(),
            initialized: true,
            loading: false,
            bootstrapping: false,
            bootstrapMessage: undefined,
            firstRunBootstrap: true,
            view: 'dashboard',
            layoutDirty: false,
          });
          finalLayout.cards.forEach(c => get().loadDataset(c.metricId));
          return;
        } catch (e) {
          console.error('[AMS:init] ❌ Bootstrap failed — falling back to empty state', e);
          set({ bootstrapping: false, bootstrapMessage: undefined });
          // Fall through to normal path
        }
      }

      // Partial bootstrap: metrics exist but no layouts → create default layout from existing metrics
      // ONLY proceed if both reads succeeded
      if (layouts.length === 0 && metrics.length > 0 && metricsLoadOk && layoutsLoadOk) {
        console.info('[AMS:init] Metrics exist but no layouts (reads succeeded) — creating default dashboard…');
        set({ bootstrapping: true, bootstrapMessage: 'Setting up your dashboard…' });

        // Idempotency check: verify no Overview layout exists (may have been created by a concurrent init)
        const existingOverview = await layoutService.findByName('Overview');
        if (existingOverview?.id) {
          console.log(`[AMS:init] Partial bootstrap: Overview already exists (id=${existingOverview.id}) — using existing`);
          set({
            metrics, layouts: [existingOverview],
            currentLayout: existingOverview,
            filters: existingOverview.filters ?? defaultFilters(),
            initialized: true, loading: false,
            bootstrapping: false, bootstrapMessage: undefined,
            view: 'dashboard',
          });
          existingOverview.cards.forEach(c => get().loadDataset(c.metricId));
          return;
        }

        const keyToId = new Map<string, string>();
        for (const m of metrics) {
          keyToId.set(`${m.sourceTable}.${m.sourceField}.${m.aggregation}`, m.id);
        }
        console.log(`[AMS:init] Built keyToId map with ${keyToId.size} entries from existing metrics`);
        const cards = buildDefaultCards(keyToId);
        console.log(`[AMS:init] buildDefaultCards() produced ${cards.length} cards from existing metrics`);
        if (cards.length > 0) {
          const overviewLayout: DashboardLayout = {
            name: 'Overview',
            cards,
            scope: 'Personal',
            isDefault: true,
          };
          // Pre-generate ID and assign locally immediately (don't rely on re-query)
          const layoutId = crypto.randomUUID();
          try {
            await layoutService.save({ ...overviewLayout, _preId: layoutId } as DashboardLayout & { _preId: string });
            console.log(`[AMS:init] Partial bootstrap: Saved Overview layout with id=${layoutId}`);
          } catch (e) {
            console.warn('[AMS:init] Partial bootstrap: Layout save failed — using in-memory', e);
          }
          const finalLayout: DashboardLayout = { ...overviewLayout, id: layoutId };
          set({
            metrics, layouts: [finalLayout],
            currentLayout: finalLayout,
            filters: defaultFilters(),
            initialized: true, loading: false,
            bootstrapping: false, bootstrapMessage: undefined,
            view: 'dashboard',
            layoutDirty: false,
          });
          finalLayout.cards.forEach(c => get().loadDataset(c.metricId));
          return;
        }
        set({ bootstrapping: false, bootstrapMessage: undefined });
      }

      // Normal path (existing user with metrics + layouts)
      console.log('[AMS:init] Normal path — using existing metrics + layouts');
      const def = layouts.find(l => l.isDefault) ?? layouts[0];
      const currentLayout = def ?? defaultLayout(layouts);
      // Auto-prune cards referencing metrics that no longer exist
      const validIds = new Set(metrics.map(m => m.id));
      let prunedCards = currentLayout.cards.filter(c => validIds.has(c.metricId));
      console.log(`[AMS:init] Normal path: layout="${currentLayout.name}", ${prunedCards.length}/${currentLayout.cards.length} cards valid`);

      // If all cards were pruned (metric IDs changed), rebuild default cards
      if (prunedCards.length === 0 && metrics.length > 0) {
        console.info('[AMS:init] All cards pruned — rebuilding default cards from existing metrics…');
        const keyToId = new Map<string, string>();
        for (const m of metrics) {
          keyToId.set(`${m.sourceTable}.${m.sourceField}.${m.aggregation}`, m.id);
        }
        const rebuilt = buildDefaultCards(keyToId);
        if (rebuilt.length > 0) {
          prunedCards = rebuilt;
          console.log(`[AMS:init] Rebuilt ${rebuilt.length} default cards`);
        }
      }

      // Normalize card dimensions to enforce minimums and resolve overlaps
      const normalizedCards = normalizeLayoutCards(prunedCards);
      // Only mark dirty if cards were pruned (references to deleted metrics removed)
      const wasPruned = prunedCards.length < currentLayout.cards.length;

      set({
        metrics,
        layouts,
        currentLayout: { ...currentLayout, cards: normalizedCards },
        filters: def?.filters ?? defaultFilters(),
        layoutDirty: wasPruned,
        initialized: true,
        loading: false,
        bootstrapping: false,
        bootstrapMessage: undefined,
        // First-run fallback: navigate to Metrics tab when no metrics exist
        view: metrics.length === 0 ? 'metric-registry' : get().view,
      });
      // Load datasets for all restored cards (same pattern as loadLayout)
      normalizedCards.forEach(c => get().loadDataset(c.metricId));
    } catch (e) {
      console.error('[AMS:init] ❌ init failed', e);
      set({ errorMsg: (e as Error).message, loading: false, initialized: true, bootstrapping: false, bootstrapMessage: undefined });
    }
  },

  setView(v) { set({ view: v }); },

  setFilters(patch) {
    set(s => ({ filters: { ...s.filters, ...patch } }));
    const { currentLayout, loadDataset } = get();
    currentLayout.cards.forEach(c => loadDataset(c.metricId, true));
  },

  addCard(metricId) {
    const cols = 12;
    const defaultW = 4;
    const defaultH = 6; // 480px — adequate room for charts with legends + axis labels
    const existing = get().currentLayout.cards;

    // Place new card at top-left (0,0) and reflow existing cards left-to-right
    const instanceId = newInstanceId();
    const newCard: CardInstance = {
      instanceId,
      metricId,
      x: 0, y: 0, w: defaultW, h: defaultH,
    };

    // Deterministic reflow: pack all cards (new first) left-to-right, top-to-bottom
    const ordered = [newCard, ...existing.sort((a, b) => a.y - b.y || a.x - b.x)];
    const reflowed: CardInstance[] = [];
    const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];

    const collides = (x: number, y: number, w: number, h: number) =>
      occupied.some(o => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);

    for (const card of ordered) {
      const { w, h } = card;
      let placedX = 0;
      let placedY = 0;
      let found = false;
      const maxY = occupied.reduce((m, o) => Math.max(m, o.y + o.h), 0) + h;
      outer: for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x + w <= cols; x++) {
          if (!collides(x, y, w, h)) {
            placedX = x;
            placedY = y;
            found = true;
            break outer;
          }
        }
      }
      if (!found) {
        placedX = 0;
        placedY = maxY;
      }
      reflowed.push({ ...card, x: placedX, y: placedY });
      occupied.push({ x: placedX, y: placedY, w, h });
    }

    set(s => ({
      currentLayout: { ...s.currentLayout, cards: reflowed },
      layoutDirty: true,
      lastAddedCardId: instanceId,
    }));
    get().loadDataset(metricId);
  },

  clearLastAddedCard() {
    set({ lastAddedCardId: null });
  },

  moveCard(instanceId, x, y) {
    set(s => ({
      currentLayout: {
        ...s.currentLayout,
        cards: s.currentLayout.cards.map(c => c.instanceId === instanceId ? { ...c, x, y } : c),
      },
      layoutDirty: true,
    }));
  },

  resizeCard(instanceId, w, h) {
    set(s => ({
      currentLayout: {
        ...s.currentLayout,
        cards: s.currentLayout.cards.map(c => c.instanceId === instanceId ? { ...c, w, h } : c),
      },
      layoutDirty: true,
    }));
  },

  applyLayoutDelta(items) {
    const map = new Map(items.map(i => [i.instanceId, i]));
    set(s => {
      const next = s.currentLayout.cards.map(c => {
        const u = map.get(c.instanceId);
        if (!u) return c;
        if (u.x === c.x && u.y === c.y && u.w === c.w && u.h === c.h) return c;
        return { ...c, x: u.x, y: u.y, w: u.w, h: u.h };
      });
      // short-circuit if nothing changed to avoid render churn
      const changed = next.some((c, i) => c !== s.currentLayout.cards[i]);
      if (!changed) return {} as Partial<AppState>;
      return { currentLayout: { ...s.currentLayout, cards: next }, layoutDirty: true };
    });
  },

  removeCard(instanceId) {
    set(s => ({
      currentLayout: {
        ...s.currentLayout,
        cards: s.currentLayout.cards.filter(c => c.instanceId !== instanceId),
      },
      layoutDirty: true,
    }));
  },

  setCardViz(instanceId: string, viz?: VisualizationType) {
    set(s => ({
      currentLayout: {
        ...s.currentLayout,
        cards: s.currentLayout.cards.map(c =>
          c.instanceId === instanceId ? { ...c, overrideViz: viz } : c
        ),
      },
      layoutDirty: true,
    }));
  },

  async loadDataset(metricId, force = false) {
    const s = get();
    if (!force && s.datasets[metricId]) return;
    const metric = s.metrics.find(m => m.id === metricId);
    if (!metric) return;
    set(st => ({ loadingDatasets: { ...st.loadingDatasets, [metricId]: true } }));
    try {
      const data = await metricService.getDataset(metric, s.filters);
      set(st => ({
        datasets: { ...st.datasets, [metricId]: data },
        loadingDatasets: { ...st.loadingDatasets, [metricId]: false },
      }));
    } catch (e) {
      console.error('loadDataset failed', e);
      set(st => ({ loadingDatasets: { ...st.loadingDatasets, [metricId]: false } }));
    }
  },

  async saveLayout(name) {
    const s = get();
    const targetName = (name ?? s.currentLayout.name).trim();
    if (!targetName) {
      return { ok: false, reason: 'Dashboard name is required.' };
    }
    // Prevent saving an empty dashboard (must have at least one chart)
    if (s.currentLayout.cards.length === 0) {
      return { ok: false, reason: 'Add at least one metric to the canvas before saving.' };
    }

    // Clash detection: find layouts with the same name (case-insensitive) that aren't the current layout
    const clashingLayouts = s.layouts.filter(
      l => l.id !== s.currentLayout.id &&
           l.name.trim().toLowerCase() === targetName.toLowerCase(),
    );

    // If the current layout has no ID but an existing layout with the same name exists,
    // adopt that existing record's ID and update it (prevents duplicate creation)
    let effectiveId = s.currentLayout.id;
    if (!effectiveId && clashingLayouts.length > 0 && clashingLayouts[0].id) {
      console.log(`[AMS:saveLayout] Current layout has no ID but "${targetName}" exists (id=${clashingLayouts[0].id}) — adopting existing record`);
      effectiveId = clashingLayouts[0].id;
    } else if (clashingLayouts.length > 0) {
      // Genuine clash: different layout with same name
      console.warn(`[AMS:saveLayout] Name clash: "${targetName}" already used by layout id=${clashingLayouts[0].id} (currentLayout.id=${s.currentLayout.id})`);
      return { ok: false, reason: `A dashboard named "${targetName}" already exists.` };
    }

    const isNew = !effectiveId;
    // For new layouts, pre-generate a UUID so we know the ID immediately after create
    const preId = isNew ? crypto.randomUUID() : undefined;
    const layout: DashboardLayout = {
      ...s.currentLayout,
      id: effectiveId,
      name: targetName,
      filters: s.filters,
    };
    console.log(`[AMS:saveLayout] Saving "${targetName}" (isNew=${isNew}, preId=${preId ?? 'n/a'}, effectiveId=${effectiveId ?? 'none'})`);
    if (isNew) {
      await layoutService.save({ ...layout, _preId: preId } as DashboardLayout & { _preId: string });
      // Assign the pre-generated ID so the local layout has a known ID going forward
      layout.id = preId;
    } else {
      await layoutService.save(layout);
    }
    let freshLayouts: DashboardLayout[];
    try {
      freshLayouts = await layoutService.list();
    } catch {
      // If re-query fails, use local state with the just-saved layout
      freshLayouts = [];
    }
    console.log(`[AMS:saveLayout] list() returned ${freshLayouts.length} layouts`);
    // Merge: ensure ALL previously known layouts + the just-saved layout are present
    const layoutsById = new Map<string, DashboardLayout>();
    for (const l of s.layouts) { if (l.id) layoutsById.set(l.id, l); }
    for (const fl of freshLayouts) { if (fl.id) layoutsById.set(fl.id, fl); }
    // Always overlay the just-saved layout last (authoritative for this operation)
    if (layout.id) layoutsById.set(layout.id, layout);
    const layouts = [...layoutsById.values()].sort((a, b) => {
      if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
      return 0;
    });
    // Re-bind currentLayout to the persisted copy (so id is set for next save).
    const persisted = layouts.find(l => l.id === layout.id)
      ?? layouts.find(l => l.name.trim().toLowerCase() === targetName.toLowerCase());
    console.log(`[AMS:saveLayout] Final layouts count: ${layouts.length}, persisted: ${persisted?.name ?? 'not found'}`);
    set({ layouts, currentLayout: persisted ?? layout, layoutDirty: false });
    return { ok: true };
  },

  loadLayout(id) {
    const s = get();
    const layout = s.layouts.find(l => l.id === id);
    if (!layout) { console.warn(`[AMS:loadLayout] Layout ${id} not found in ${s.layouts.length} layouts`); return; }
    console.log(`[AMS:loadLayout] Switching to "${layout.name}" (${id})`);
    // Auto-prune cards referencing metrics that no longer exist
    const validIds = new Set(s.metrics.map(m => m.id));
    const prunedCards = layout.cards.filter(c => validIds.has(c.metricId));
    const wasPruned = prunedCards.length < layout.cards.length;
    // Normalize card dimensions
    const normalizedCards = normalizeLayoutCards(prunedCards);
    // Only mark dirty if cards were actually pruned (invalid metrics removed).
    // Normalization adjustments (min-size enforcement, collision shifts) are cosmetic
    // and should not force a save — they'll be persisted on next intentional save.
    const cleaned = { ...layout, cards: normalizedCards };
    set({ currentLayout: cleaned, filters: layout.filters ?? defaultFilters(), datasets: {}, layoutDirty: wasPruned });
    cleaned.cards.forEach(c => get().loadDataset(c.metricId));
  },

  newLayout() {
    const s = get();
    console.log('[AMS:newLayout] Creating new blank dashboard');
    set({ currentLayout: defaultLayout(s.layouts), datasets: {}, filters: defaultFilters(), layoutDirty: true });
  },

  async deleteLayout(id) {
    const s = get();
    const target = s.layouts.find(l => l.id === id);
    if (!target || !id) return { ok: false, reason: 'Dashboard not found.' };
    console.log(`[AMS:deleteLayout] Deleting "${target.name}" (${id})`);
    try {
      await layoutService.remove(id);
    } catch (e) {
      return { ok: false, reason: (e as Error).message ?? 'Delete failed.' };
    }
    const freshLayouts = await layoutService.list();
    // Merge: start from existing (minus deleted), overlay with fresh data
    const layoutsById = new Map<string, DashboardLayout>();
    for (const l of s.layouts) { if (l.id && l.id !== id) layoutsById.set(l.id, l); }
    for (const fl of freshLayouts) { if (fl.id && fl.id !== id) layoutsById.set(fl.id, fl); }
    const layouts = [...layoutsById.values()].sort((a, b) => {
      if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
      return 0;
    });
    console.log(`[AMS:deleteLayout] Remaining layouts: ${layouts.length}`);
    // If the user just deleted the active dashboard, swap to the next available
    // or start a fresh one.
    const isCurrent = s.currentLayout.id === id;
    if (isCurrent) {
      const next = layouts[0];
      if (next) {
        set({ layouts, currentLayout: next, filters: next.filters ?? defaultFilters(), datasets: {} });
        next.cards.forEach(c => get().loadDataset(c.metricId));
      } else {
        set({ layouts, currentLayout: defaultLayout(layouts), datasets: {}, filters: defaultFilters() });
      }
    } else {
      set({ layouts });
    }
    return { ok: true };
  },

  async renameLayout(id, newName) {
    const s = get();
    const target = s.layouts.find(l => l.id === id);
    if (!target) return { ok: false, reason: 'Dashboard not found.' };
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, reason: 'Dashboard name is required.' };
    const clash = s.layouts.some(
      l => l.id !== id && l.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) return { ok: false, reason: `A dashboard named "${trimmed}" already exists.` };
    console.log(`[AMS:renameLayout] Renaming "${target.name}" → "${trimmed}" (${id})`);
    try {
      await layoutService.save({ ...target, name: trimmed });
    } catch (e) {
      return { ok: false, reason: (e as Error).message ?? 'Rename failed.' };
    }
    const freshLayouts = await layoutService.list();
    // Merge: start from existing, overlay with fresh data, then overlay renamed target last
    const layoutsById = new Map<string, DashboardLayout>();
    for (const l of s.layouts) { if (l.id) layoutsById.set(l.id, l); }
    for (const fl of freshLayouts) { if (fl.id) layoutsById.set(fl.id, fl); }
    // Overlay renamed target last (authoritative for this operation)
    layoutsById.set(id, { ...target, name: trimmed });
    const layouts = [...layoutsById.values()].sort((a, b) => {
      if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
      return 0;
    });
    const persisted = layouts.find(l => l.id === id);
    const isCurrent = s.currentLayout.id === id;
    set({
      layouts,
      currentLayout: isCurrent && persisted ? persisted : s.currentLayout,
    });
    return { ok: true };
  },

  openPredictive(metricId) {
    set({ predictivePanelOpen: true, predictiveMetricId: metricId, predictiveMetricLocked: !!metricId });
  },

  closePredictive() {
    set({ predictivePanelOpen: false, predictiveMetricLocked: false });
  },

  setScenario(sc) {
    set(st => ({ scenarioInputs: { ...st.scenarioInputs, ...sc } }));
  },

  openDrillIn(req) { set({ drillIn: req }); },
  closeDrillIn() { set({ drillIn: undefined }); },
  toggleSidebar() { set(st => ({ sidebarCollapsed: !st.sidebarCollapsed })); },
  toggleForecastSidebar() { set(st => ({ forecastSidebarCollapsed: !st.forecastSidebarCollapsed })); },

  async loadAgents() {
    set({ agentsLoading: true });
    try {
      const agents = await loadAgentOptions();
      set({ agents, agentsLoading: false });
    } catch (e) {
      console.warn('[AMS] Failed to load agents for filter:', e);
      set({ agents: [], agentsLoading: false });
    }
  },

  resetLayout() {
    const s = get();
    const cards = [...s.currentLayout.cards];
    if (cards.length === 0) return;
    // Sort by current position (top-to-bottom, left-to-right)
    cards.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
    const cols = 12;
    const n = cards.length;
    // Determine optimal cards per row — max 3-per-row to ensure chart readability
    const perRow = n <= 2 ? 2 : 3;
    const cardW = Math.floor(cols / perRow);
    const defaultH = 6; // 480px — adequate room for charts with legends + axis labels
    // Place cards in a uniform grid, resized to fill width
    const placed: CardInstance[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      placed.push({ ...cards[i], x: col * cardW, y: row * defaultH, w: cardW, h: defaultH });
    }
    set({ currentLayout: { ...s.currentLayout, cards: placed }, layoutDirty: true });
  },
}));
