import type { PersonnelRow, PositionRow } from './types';

const ROLE_VARIATION_IDS: Record<string, string> = {
  Kältemechatroniker: '9629',
  Meister: '9019',
  Helfer: '13005',
};

export const ROUTE_ARTICLES = [
  { variationId: '9624', name: 'Anfahrtspauschale 15 km', maximumOneWayKm: 15 },
  { variationId: '9625', name: 'Anfahrtspauschale 30 km', maximumOneWayKm: 30 },
  { variationId: '9626', name: 'Anfahrtspauschale 50 km', maximumOneWayKm: 50 },
] as const;

function routePosition(distanceKm: number, existing: PositionRow[]): PositionRow {
  const oneWayKm = distanceKm / 2;
  const defaultName = oneWayKm <= 0
    ? 'Anfahrtspauschale – Strecke noch berechnen'
    : oneWayKm <= 15
      ? 'Anfahrtspauschale 15 km'
      : oneWayKm <= 30
        ? 'Anfahrtspauschale 30 km'
        : oneWayKm <= 50
          ? 'Anfahrtspauschale 50 km'
          : 'Anfahrt über 50 km';
  const fixedVariationId = oneWayKm <= 0
    ? undefined
    : ROUTE_ARTICLES.find((article) => oneWayKm <= article.maximumOneWayKm)?.variationId;
  const sourceKey = `route:${defaultName}`;
  const previous = existing.find((row) => row.sourceType === 'route' && row.sourceKey === sourceKey);
  return {
    id: previous?.id ?? crypto.randomUUID(),
    quantity: 1,
    unit: 'Pauschale',
    name: previous?.name || defaultName,
    variationId: previous?.variationId ?? fixedVariationId,
    sourceType: 'route',
    sourceKey,
  };
}

function laborPositions(personnel: PersonnelRow[], existing: PositionRow[], driveMinutes: number): PositionRow[] {
  const grouped = new Map<string, number>();
  const travelHoursPerPerson = Math.max(0, Number(driveMinutes) || 0) / 60;
  for (const row of personnel) {
    const role = row.role.trim();
    if (!role) continue;
    grouped.set(role, Math.round(((grouped.get(role) ?? 0) + (Number(row.hours) || 0) + travelHoursPerPerson) * 100) / 100);
  }
  return [...grouped.entries()].map(([role, hours]) => {
    const sourceKey = `labor:${role}`;
    const previous = existing.find((row) => row.sourceType === 'labor' && row.sourceKey === sourceKey);
    return {
      id: previous?.id ?? crypto.randomUUID(),
      quantity: hours,
      unit: 'Std.',
      name: previous?.name || role,
      variationId: ROLE_VARIATION_IDS[role] || previous?.variationId,
      sourceType: 'labor',
      sourceKey,
    };
  });
}

export function withAutomaticPositions(positions: PositionRow[], personnel: PersonnelRow[], distanceKm: number, driveMinutes = 0) {
  const materials = positions.filter((row) => !row.sourceType || row.sourceType === 'material');
  return [routePosition(distanceKm, positions), ...laborPositions(personnel, positions, driveMinutes), ...materials];
}
