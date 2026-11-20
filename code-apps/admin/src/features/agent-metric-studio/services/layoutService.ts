// Save + load per-user dashboard layouts in cat_userlayout.

import { dv } from './dataverseClient';
import { buildOwnerFilter } from './userContextService';
import type { DashboardLayout } from '../types';

interface CatLayoutRow {
  cat_userlayoutid: string;
  cat_layoutname: string;
  cat_description?: string;
  cat_layoutjson: string;
  cat_filtersjson?: string;
  cat_isdefault: boolean;
  cat_isshared: boolean;
  cat_layoutscope: number;
}

const SCOPE: Record<number, DashboardLayout['scope']> = {
  10000: 'Personal', 10001: 'Team', 10002: 'Tenant',
};

function rowToLayout(r: CatLayoutRow): DashboardLayout {
  let cards: DashboardLayout['cards'] = [];
  try { cards = JSON.parse(r.cat_layoutjson || '[]'); } catch { /* ignore */ }
  let filters: DashboardLayout['filters'];
  try { if (r.cat_filtersjson) filters = JSON.parse(r.cat_filtersjson); } catch { /* ignore */ }
  return {
    id: r.cat_userlayoutid,
    name: r.cat_layoutname,
    description: r.cat_description,
    cards,
    filters,
    isDefault: r.cat_isdefault,
    isShared: r.cat_isshared,
    scope: SCOPE[r.cat_layoutscope] ?? 'Personal',
  };
}

export const layoutService = {
  /**
   * Load all layouts for the current user. Throws on failure so callers can
   * distinguish "zero layouts" from "read failed" (prevents fail-open bootstrap).
   */
  async list(): Promise<DashboardLayout[]> {
    const filter = buildOwnerFilter();
    if (!filter) {
      console.warn('[AMS:layoutService] list(): No user context — returning empty (fail-closed)');
      return [];
    }
    console.log('[AMS:layoutService] list(): Querying cat_userlayouts…');
    const rows = await dv.list<CatLayoutRow>('cat_userlayouts', {
      filter,
      top: 200,
    });
    const layouts = rows.map(rowToLayout).sort((a, b) => {
      if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
      return 0;
    });
    console.log(`[AMS:layoutService] list(): Returned ${layouts.length} layouts`);
    return layouts;
  },

  /**
   * Find a layout by name (case-insensitive) among the user's owned layouts.
   * Returns the first match or undefined.
   */
  async findByName(name: string): Promise<DashboardLayout | undefined> {
    const filter = buildOwnerFilter({
      baseFilter: `cat_layoutname eq '${name.replace(/'/g, "''")}'`,
    });
    if (!filter) return undefined;
    console.log(`[AMS:layoutService] findByName("${name}"): Querying…`);
    try {
      const rows = await dv.list<CatLayoutRow>('cat_userlayouts', {
        filter,
        top: 1,
      });
      if (rows.length > 0) {
        const layout = rowToLayout(rows[0]);
        console.log(`[AMS:layoutService] findByName("${name}"): Found existing layout id=${layout.id}`);
        return layout;
      }
    } catch (e) {
      console.warn(`[AMS:layoutService] findByName("${name}") query failed`, e);
    }
    console.log(`[AMS:layoutService] findByName("${name}"): No match found`);
    return undefined;
  },


  async save(layout: DashboardLayout): Promise<void> {
    const scopeCode = Object.entries(SCOPE).find(([, v]) => v === layout.scope)?.[0] ?? '10000';
    const row: Record<string, unknown> = {
      cat_layoutname: layout.name,
      cat_description: layout.description ?? '',
      cat_layoutjson: JSON.stringify(layout.cards),
      cat_filtersjson: layout.filters ? JSON.stringify(layout.filters) : '',
      cat_isdefault: !!layout.isDefault,
      cat_isshared: !!layout.isShared,
      cat_layoutscope: Number(scopeCode),
    };
    if (layout.id) {
      console.log(`[AMS:layoutService] save(): Updating existing layout id=${layout.id}, name="${layout.name}"`);
      await dv.update('cat_userlayouts', layout.id, row);
    } else {
      // Use pre-generated ID if provided via _preId (avoids eventual-consistency re-query)
      if ((layout as { _preId?: string })._preId) {
        row.cat_userlayoutid = (layout as { _preId?: string })._preId;
      }
      console.log(`[AMS:layoutService] save(): Creating new layout name="${layout.name}", preId=${(layout as { _preId?: string })._preId ?? 'none'}`);
      await dv.create('cat_userlayouts', row);
    }
  },

  async remove(id: string): Promise<void> {
    console.log(`[AMS:layoutService] remove(): Deleting layout id=${id}`);
    await dv.remove('cat_userlayouts', id);
  },
};
