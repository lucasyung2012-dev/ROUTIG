import { Accessibility, ArrowLeftRight, Bell, DatabaseBackup, Globe, HardDrive, Info, Languages, LayoutGrid, LifeBuoy, Lock, Palette, PanelsTopLeft, ShieldCheck, Smartphone, UserRound, type LucideIcon } from 'lucide-react';

/** Seções de Settings com comportamento real (Parte 22). As que dependem de etapas futuras aparecem em Sobre. */
export const SETTINGS_SECTIONS = [
  { id: 'profile', icon: UserRound },
  { id: 'appearance', icon: Palette },
  { id: 'language', icon: Languages },
  { id: 'region', icon: Globe },
  { id: 'navigation', icon: PanelsTopLeft },
  { id: 'modules', icon: LayoutGrid },
  { id: 'notifications', icon: Bell },
  { id: 'privacy', icon: ShieldCheck },
  { id: 'security', icon: Lock },
  { id: 'storage', icon: HardDrive },
  { id: 'backup', icon: DatabaseBackup },
  { id: 'transfer', icon: ArrowLeftRight },
  { id: 'devices', icon: Smartphone },
  { id: 'accessibility', icon: Accessibility },
  { id: 'help', icon: LifeBuoy },
  { id: 'about', icon: Info },
] as const satisfies ReadonlyArray<{ id: string; icon: LucideIcon }>;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function isSettingsSection(id: string | undefined): id is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === id);
}
