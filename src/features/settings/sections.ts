import { Accessibility, Globe, HardDrive, Info, Languages, Palette, PanelsTopLeft, UserRound, type LucideIcon } from 'lucide-react';

/** Seções de Settings que já têm comportamento real na Etapa 0. */
export const SETTINGS_SECTIONS = [
  { id: 'profile', icon: UserRound },
  { id: 'appearance', icon: Palette },
  { id: 'language', icon: Languages },
  { id: 'region', icon: Globe },
  { id: 'navigation', icon: PanelsTopLeft },
  { id: 'accessibility', icon: Accessibility },
  { id: 'storage', icon: HardDrive },
  { id: 'about', icon: Info },
] as const satisfies ReadonlyArray<{ id: string; icon: LucideIcon }>;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function isSettingsSection(id: string | undefined): id is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === id);
}
