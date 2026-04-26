/**
 * Centralized System kW Calculation Utilities
 * Single source of truth for all kW calculations across frontend and backend
 * 
 * ROUNDING RULES:
 * - Sub-1kW systems (< 1 kW): Preserve decimal precision (e.g., 0.68 stays 0.68)
 * - Systems >= 1 kW: Use standard Math.round() (e.g., 1.64 → 2, 3.49 → 3, 3.50 → 4)
 */

/**
 * Calculate actual kW from panel watts and panel count
 * Formula: (Panel Watts × Panel Count) / 1000
 * Returns precise kW value rounded to 2 decimal places
 * 
 * @example calculateSystemKW(540, 3) → 1.62
 * @example calculateSystemKW("530", 6) → 3.18
 */
export function calculateSystemKW(panelWatts: string | number, panelCount: number): number {
  const watts = typeof panelWatts === 'string' ? parseInt(panelWatts, 10) : panelWatts;
  if (isNaN(watts) || watts <= 0 || panelCount <= 0) return 0;
  
  const totalWatts = watts * panelCount;
  const kw = totalWatts / 1000;
  return Math.round(kw * 100) / 100;
}

/**
 * Round system kW for rate calculations and display
 * Uses standard mathematical rounding for systems >= 1 kW
 * 
 * CRITICAL: This is the single source of truth for kW rounding
 * - < 1 kW: Preserve decimal precision (0.68 stays 0.68)
 * - >= 1 kW: Standard Math.round() (1.64 → 2, 3.49 → 3, 3.50 → 4)
 * 
 * @example roundSystemKW(0.68) → 0.68 (preserved)
 * @example roundSystemKW(1.64) → 2 (rounded up)
 * @example roundSystemKW(3.49) → 3 (rounded down)
 * @example roundSystemKW(3.50) → 4 (rounded up)
 */
export function roundSystemKW(actualKW: number): number {
  if (actualKW <= 0) return 0;
  if (actualKW < 1) return actualKW;
  return Math.round(actualKW);
}

/**
 * Format kW value for display in quotations
 * 
 * Rules:
 * - < 1 kW: Show up to 2 decimal places, remove trailing zeros (e.g., 0.75 → "0.75", 0.50 → "0.5")
 * - >= 1 kW: Round to nearest whole number (e.g., 1.64 → "2", 3.24 → "3", 9.90 → "10")
 * 
 * @example formatKWForDisplay(0.68) → "0.68"
 * @example formatKWForDisplay(1.64) → "2"
 * @example formatKWForDisplay(3.5) → "4"
 */
export function formatKWForDisplay(kw: number): string {
  if (kw < 1) {
    return kw.toFixed(2).replace(/\.?0+$/, '');
  }
  return Math.round(kw).toString();
}

/**
 * Parse panel watts from various input formats
 * Handles string with 'W' suffix, numeric strings, and numbers
 * 
 * @example parsePanelWatts("540W") → 540
 * @example parsePanelWatts("540") → 540
 * @example parsePanelWatts(540) → 540
 */
export function parsePanelWatts(panelWatts: string | number | undefined | null): number {
  if (panelWatts === undefined || panelWatts === null) return 0;
  
  const str = String(panelWatts).trim();
  const cleaned = str.replace(/[^\d]/g, '');
  const parsed = parseInt(cleaned, 10);
  
  return isNaN(parsed) ? 0 : parsed;
}
