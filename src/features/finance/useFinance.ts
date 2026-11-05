import { createContext, useContext, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { computePosition, type FinAsset, type FinQuote, type FinTransaction, type Position } from '@/domain/finance';

export interface FinanceData {
  loading: boolean;
  assets: FinAsset[];
  archived: FinAsset[];
  trash: FinAsset[];
  byId: Map<string, FinAsset>;
  txsOf: (assetId: string) => FinTransaction[];
  quotesOf: (assetId: string) => FinQuote[];
  positionOf: (assetId: string) => Position;
}

export function useFinance(): FinanceData {
  const assets = useLiveQuery(() => getDb().finAssets.toArray(), []);
  const txs = useLiveQuery(() => getDb().finTransactions.filter((t) => !t.deletedAt).toArray(), []);
  const quotes = useLiveQuery(() => getDb().finQuotes.filter((q) => !q.deletedAt).toArray(), []);
  return useMemo(() => {
    const txBy = new Map<string, FinTransaction[]>();
    for (const t of txs ?? []) txBy.set(t.assetId, [...(txBy.get(t.assetId) ?? []), t]);
    for (const l of txBy.values()) l.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const qBy = new Map<string, FinQuote[]>();
    for (const q of quotes ?? []) qBy.set(q.assetId, [...(qBy.get(q.assetId) ?? []), q]);
    for (const l of qBy.values()) l.sort((a, b) => b.date.localeCompare(a.date));
    const positions = new Map<string, Position>();
    const live = (assets ?? []).filter((a) => !a.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    return {
      loading: assets === undefined || txs === undefined || quotes === undefined,
      assets: live.filter((a) => !a.archived),
      archived: live.filter((a) => a.archived),
      trash: (assets ?? []).filter((a) => a.deletedAt),
      byId: new Map((assets ?? []).map((a) => [a.id, a])),
      txsOf: (id) => txBy.get(id) ?? [],
      quotesOf: (id) => qBy.get(id) ?? [],
      positionOf: (id) => {
        let p = positions.get(id);
        if (!p) positions.set(id, (p = computePosition(txBy.get(id) ?? [], qBy.get(id) ?? [])));
        return p;
      },
    };
  }, [assets, txs, quotes]);
}

/** Valores escondidos (Parte 16.8): todas as telas de Finanças leem daqui. */
export const HideContext = createContext(true);
export const useHidden = () => useContext(HideContext);
