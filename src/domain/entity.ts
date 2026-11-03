/**
 * Campos comuns a todo registro do ROUTIG. Cada módulo estende esta base;
 * exclusão é sempre lógica (deletedAt) até o usuário confirmar na Lixeira.
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Incrementa a cada alteração; usado no histórico e em futuras sincronizações. */
  rev: number;
}

/** Referência a qualquer registro de qualquer módulo, sem copiar o registro. */
export interface EntityRef {
  type: string;
  id: string;
}

export const refKey = (ref: EntityRef): string => `${ref.type}:${ref.id}`;

/** Vínculo entre dois registros (ex.: material da Library ligado a uma disciplina). */
export interface Link {
  id: string;
  from: string;
  to: string;
  relation: string;
  createdAt: string;
}

/** Entrada do histórico de alterações. */
export interface ChangeEntry {
  seq?: number;
  at: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'purge' | 'migrate' | 'complete' | 'skip';
  fields?: string[];
  /** Detalhe curto e legível (ex.: data da ocorrência concluída). */
  note?: string;
}
