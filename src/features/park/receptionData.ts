import type { InboxItem } from '@/domain/inbox';
import { toDateKey, type DateKey } from '@/domain/dates';
import type { Destination, ReceptionData } from './receptionInterior';

const destOf = (i: InboxItem): Destination | null => {
  const ty = i.processedTo?.type;
  return ty === 'task' || ty === 'event' || ty === 'note' || ty === 'library' ? ty : null;
};

/** Números da Central de Recepção, lidos dos itens reais do Inbox (excluídos ficam de fora). */
export function receptionData(items: InboxItem[], today: DateKey): ReceptionData {
  const live = items.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byType: Record<Destination, number> = { task: 0, event: 0, note: 0, library: 0 };
  const out: ReceptionData = { open: 0, snoozed: 0, processed: 0, archived: 0, today: 0, byType, recent: [] };
  for (const i of live) {
    if (i.status === 'open') {
      if (i.snoozedUntil && i.snoozedUntil > today) out.snoozed++;
      else out.open++;
    } else if (i.status === 'processed') {
      out.processed++;
      const d = destOf(i);
      if (d) byType[d]++;
    } else out.archived++;
    // createdAt é ISO em UTC; "hoje" é o dia local.
    if (toDateKey(new Date(i.createdAt)) === today) out.today++;
  }
  out.recent = live.slice(0, 3).map((i) => i.text || i.fileName || '');
  return out;
}
