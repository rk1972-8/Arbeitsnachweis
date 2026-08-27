export const PERSONNEL_NAMES = [
  'Daniel Seibold',
  'Rolf Köhler',
  'Pascal Köhler',
  'Oskar Köhler',
  'Elena Köhler',
] as const;

export const PERSONNEL_ROLES = ['Kältemechatroniker', 'Meister', 'Helfer'] as const;

export const DEFAULT_PERSONNEL_ROLE = 'Kältemechatroniker';

const DEFAULT_ROLE_BY_NAME: Partial<Record<(typeof PERSONNEL_NAMES)[number], (typeof PERSONNEL_ROLES)[number]>> = {
  'Daniel Seibold': 'Kältemechatroniker',
  'Rolf Köhler': 'Meister',
  'Pascal Köhler': 'Helfer',
};

export function isPersonnelName(value: string): value is (typeof PERSONNEL_NAMES)[number] {
  return PERSONNEL_NAMES.includes(value as (typeof PERSONNEL_NAMES)[number]);
}

export function isPersonnelRole(value: string): value is (typeof PERSONNEL_ROLES)[number] {
  return PERSONNEL_ROLES.includes(value as (typeof PERSONNEL_ROLES)[number]);
}

export function defaultRoleForName(name: string, fallback = DEFAULT_PERSONNEL_ROLE) {
  return isPersonnelName(name) ? DEFAULT_ROLE_BY_NAME[name] ?? fallback : fallback;
}
