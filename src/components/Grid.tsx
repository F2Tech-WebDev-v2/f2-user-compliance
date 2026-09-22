import { useMemo, useState, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeQuartz, colorSchemeDark } from 'ag-grid-community';

// Register all community modules once (module federation shift in ag-grid 33).
ModuleRegistry.registerModules([AllCommunityModule]);

// Compact dark theme aligned with the rest of compliance-review's palette.
const gridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: '#111827',
  foregroundColor: '#e5e7eb',
  headerBackgroundColor: '#1f2937',
  headerTextColor: '#9ca3af',
  oddRowBackgroundColor: '#0f172a',
  borderColor: '#374151',
  accentColor: '#60a5fa',
  rowHoverColor: '#1e293b',
  fontSize: 12,
});

// Shared wrapper for all data grids in compliance-review. Matches the
// filter+paging+total-count pattern of f2-admin's ag-grid views but
// scoped to client-side (row-model = clientSide) since our result sets
// are all bounded (≤2000 rows).
export function Grid<T = any>({
  columnDefs,
  rowData,
  height,
  filterQuery,
  onFilterChange,
  pageSize = 50,
  loading = false,
}: {
  columnDefs: ColDef<T>[];
  rowData: T[] | null;
  /** Fixed pixel height. If omitted, grid grows to fill parent viewport. */
  height?: number;
  filterQuery?: string;
  onFilterChange?: (q: string) => void;
  pageSize?: number;
  loading?: boolean;
}) {
  const gridApiRef = useRef<GridApi | null>(null);
  const [displayedCount, setDisplayedCount] = useState(0);
  const total = rowData?.length ?? 0;

  const defaultColDef: ColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    flex: 1,
    minWidth: 60,
    floatingFilter: false,
  }), []);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    gridApiRef.current = e.api;
    if (filterQuery) e.api.setGridOption('quickFilterText', filterQuery);
    setDisplayedCount(e.api.getDisplayedRowCount());
    // Fit all columns into viewport — kills the horizontal scrollbar Mike
    // called out (c/3353967d). sizeColumnsToFit honors minWidth so
    // "narrow" columns don't collapse to zero.
    try { e.api.sizeColumnsToFit(); } catch {}
  }, [filterQuery]);

  const onFilterModelChanged = useCallback(() => {
    if (gridApiRef.current) setDisplayedCount(gridApiRef.current.getDisplayedRowCount());
  }, []);

  const localQuery = filterQuery ?? '';
  const setQuery = useCallback((q: string) => {
    if (onFilterChange) onFilterChange(q);
    if (gridApiRef.current) {
      gridApiRef.current.setGridOption('quickFilterText', q);
      setDisplayedCount(gridApiRef.current.getDisplayedRowCount());
    }
  }, [onFilterChange]);

  function exportCsv() {
    if (!gridApiRef.current) return;
    gridApiRef.current.exportDataAsCsv({
      fileName: `compliance_export_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`,
    });
  }

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'err'>('idle');
  async function copyDebug() {
    // Grab the currently displayed rows (post-sort + post-filter) so the
    // diagnostic payload is exactly what the auditor sees on-screen. Falls
    // back to full rowData when the grid API is unavailable.
    let displayed: any[] = [];
    if (gridApiRef.current) {
      gridApiRef.current.forEachNodeAfterFilterAndSort((n) => { if (n.data) displayed.push(n.data); });
    } else {
      displayed = (rowData || []) as any[];
    }
    const payload = {
      url: window.location.href,
      generated_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      filter: filterQuery || '',
      displayed_count: displayed.length,
      total_count: (rowData || []).length,
      rows: displayed,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      // Clipboard API can fail in iframes / insecure contexts. Fall back
      // to a hidden textarea + execCommand.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyState('copied');
      } catch {
        setCopyState('err');
      }
    }
    setTimeout(() => setCopyState('idle'), 1800);
  }

  // When no explicit height, flex-fill parent (parent chain must be
  // display:flex, direction:column, min-height:0 — see AuditTrail etc.
  // for the page-level wrapper pattern). Fixed height stays supported
  // for special cases.
  const gridWrapperStyle: React.CSSProperties = height
    ? { height, width: '100%' }
    : { flex: 1, minHeight: 0, width: '100%' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={localQuery}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter across all columns…"
          style={{ flex: 1, maxWidth: 400 }}
        />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {loading ? 'Loading…' : `${displayedCount.toLocaleString()} / ${total.toLocaleString()} row${total === 1 ? '' : 's'}`}
        </span>
        <button type="button" onClick={exportCsv} disabled={total === 0}>Export CSV</button>
        <button type="button" onClick={copyDebug} disabled={total === 0} title="Copy displayed rows + context as JSON to clipboard for diagnostics">
          {copyState === 'copied' ? '✓ Copied' : copyState === 'err' ? '⚠ Copy failed' : 'Copy Debug'}
        </button>
      </div>
      <div style={gridWrapperStyle}>
        <AgGridReact<T>
          theme={gridTheme}
          columnDefs={columnDefs}
          rowData={rowData || []}
          defaultColDef={defaultColDef}
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          onGridReady={onGridReady}
          onFilterChanged={onFilterModelChanged}
          onSortChanged={onFilterModelChanged}
          onModelUpdated={onFilterModelChanged}
        />
      </div>
    </div>
  );
}
