import { getDb } from './db';
import { matchesAll, rankHits, snippetFor, type SearchableModule, type SearchHit } from '@/domain/search';

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const LIMIT = 6;

/**
 * Busca nos módulos que a busca antiga não cobria: títulos, descrições, textos, tags, categorias e metadados
 * (Parte 4.3). Respeita os módulos escondidos da busca pela privacidade. Lê só na hora de buscar.
 */
export async function searchModules(query: string, hidden: SearchableModule[]): Promise<SearchHit[]> {
  if (query.trim().length < 2) return [];
  const db = getDb();
  const on = (m: SearchableModule) => !hidden.includes(m);
  const out: SearchHit[] = [];
  const push = (hits: SearchHit[]) => out.push(...rankHits(query, hits).slice(0, LIMIT));

  if (on('goals')) {
    const goals = await db.goals.filter((g) => !g.deletedAt).toArray();
    push(goals.filter((g) => matchesAll(query, g.name, g.description, g.notes, g.milestones.map((m) => m.title).join(' '))).map((g) => ({ key: `g:${g.id}`, group: 'goals', type: 'goal', label: g.name, date: g.deadline, snippet: snippetFor(query, `${g.description} ${g.notes}`), path: `/goals/${g.id}` })));
  }
  if (on('habits')) {
    const habits = await db.habits.filter((h) => !h.deletedAt).toArray();
    const logs = await db.habitLogs.filter((l) => !l.deletedAt && !!l.note).toArray();
    const names = new Map(habits.map((h) => [h.id, h.name]));
    push([
      ...habits.filter((h) => matchesAll(query, h.name, h.description, h.category, h.notes)).map((h) => ({ key: `h:${h.id}`, group: 'habits' as const, type: 'habit', label: h.name, date: null, snippet: snippetFor(query, `${h.description} ${h.notes}`), path: `/habits/${h.id}` })),
      ...logs.filter((l) => names.has(l.habitId) && matchesAll(query, l.note)).map((l) => ({ key: `hl:${l.id}`, group: 'habits' as const, type: 'habitLog', label: names.get(l.habitId)!, date: l.date, snippet: snippetFor(query, l.note), path: `/habits/${l.habitId}` })),
    ]);
  }
  if (on('academy')) {
    const subjects = await db.subjects.filter((s) => !s.deletedAt).toArray();
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const [assessments, contents, lessons, doubts] = await Promise.all([db.assessments.filter((a) => !a.deletedAt).toArray(), db.contents.filter((c) => !c.deletedAt).toArray(), db.lessons.filter((l) => !l.deletedAt).toArray(), db.doubts.filter((d) => !d.deletedAt).toArray()]);
    push([
      ...subjects.filter((s) => matchesAll(query, s.name, s.notes)).map((s) => ({ key: `s:${s.id}`, group: 'academy' as const, type: 'subject', label: s.name, date: null, snippet: '', path: `/academy/subjects/${s.id}` })),
      ...assessments.filter((a) => matchesAll(query, a.name, a.notes, a.topics, subjectName.get(a.subjectId))).map((a) => ({ key: `a:${a.id}`, group: 'academy' as const, type: 'assessment', label: `${a.name} · ${subjectName.get(a.subjectId) ?? ''}`, date: a.date, snippet: snippetFor(query, `${a.topics} ${a.notes}`), path: `/academy/assessments/${a.id}` })),
      ...contents.filter((c) => matchesAll(query, c.title, c.notes)).map((c) => ({ key: `c:${c.id}`, group: 'academy' as const, type: 'content', label: `${c.title} · ${subjectName.get(c.subjectId) ?? ''}`, date: null, snippet: snippetFor(query, c.notes), path: `/academy/subjects/${c.subjectId}` })),
      ...lessons.filter((l) => matchesAll(query, l.topic, l.notes, l.difficulties, l.observations)).map((l) => ({ key: `l:${l.id}`, group: 'academy' as const, type: 'lesson', label: `${l.topic || subjectName.get(l.subjectId) || ''}`, date: l.date, snippet: snippetFor(query, `${l.notes} ${l.difficulties}`), path: `/academy/subjects/${l.subjectId}` })),
      ...doubts.filter((d) => matchesAll(query, d.question, d.answer)).map((d) => ({ key: `d:${d.id}`, group: 'academy' as const, type: 'doubt', label: d.question, date: day(d.createdAt), snippet: snippetFor(query, d.answer), path: `/academy/subjects/${d.subjectId}` })),
    ]);
  }
  if (on('languages')) {
    const langs = await db.languages.filter((l) => !l.deletedAt).toArray();
    const langName = new Map(langs.map((l) => [l.id, l.name]));
    const [vocab, grammar, sessions] = await Promise.all([db.vocab.filter((v) => !v.deletedAt).toArray(), db.grammarRules.filter((g) => !g.deletedAt).toArray(), db.languageSessions.filter((s) => !s.deletedAt).toArray()]);
    push([
      ...langs.filter((l) => matchesAll(query, l.name, l.notes, l.goals.join(' '))).map((l) => ({ key: `lg:${l.id}`, group: 'languages' as const, type: 'language', label: l.name, date: null, snippet: '', path: `/languages/${l.id}` })),
      ...vocab.filter((v) => matchesAll(query, v.term, v.translation, v.example, v.exampleTranslation, v.category, v.mandarin?.characters, v.mandarin?.pinyin)).map((v) => ({ key: `v:${v.id}`, group: 'languages' as const, type: 'word', label: `${v.term} · ${v.translation}`, date: null, snippet: langName.get(v.languageId) ?? '', path: `/languages/${v.languageId}` })),
      ...grammar.filter((g) => matchesAll(query, g.title, g.topic, g.explanation, g.examples.join(' '))).map((g) => ({ key: `gr:${g.id}`, group: 'languages' as const, type: 'grammar', label: g.title, date: null, snippet: snippetFor(query, g.explanation), path: `/languages/${g.languageId}` })),
      ...sessions.filter((s) => matchesAll(query, s.content, s.difficulties, s.result, s.notes)).map((s) => ({ key: `ls:${s.id}`, group: 'languages' as const, type: 'session', label: langName.get(s.languageId) ?? '', date: s.date, snippet: snippetFor(query, `${s.content} ${s.notes}`), path: `/languages/${s.languageId}` })),
    ]);
  }
  if (on('music')) {
    const [songs, items, practice] = await Promise.all([db.songs.filter((s) => !s.deletedAt).toArray(), db.musicItems.filter((i) => !i.deletedAt).toArray(), db.practiceSessions.filter((p) => !p.deletedAt).toArray()]);
    push([
      ...songs.filter((s) => matchesAll(query, s.name, s.artist, s.composer, s.genre, s.chords.join(' '), s.chordSheet, s.notes)).map((s) => ({ key: `sg:${s.id}`, group: 'music' as const, type: 'song', label: `${s.name}${s.artist ? ` · ${s.artist}` : ''}`, date: null, snippet: snippetFor(query, `${s.chordSheet} ${s.notes}`), path: `/music/${s.instrumentId}` })),
      ...items.filter((i) => matchesAll(query, i.name, i.description, i.pattern, i.notes, i.difficulties)).map((i) => ({ key: `mi:${i.id}`, group: 'music' as const, type: i.category, label: i.name, date: null, snippet: snippetFor(query, `${i.description} ${i.notes}`), path: `/music/${i.instrumentId}` })),
      ...practice.filter((p) => matchesAll(query, p.goal, p.practiced, p.difficulties, p.notes)).map((p) => ({ key: `pr:${p.id}`, group: 'music' as const, type: 'practice', label: p.goal || p.practiced.slice(0, 60), date: p.date, snippet: snippetFor(query, `${p.practiced} ${p.notes}`), path: `/music/${p.instrumentId}` })),
    ]);
  }
  if (on('sports')) {
    const [acts, items] = await Promise.all([db.sportActivities.filter((a) => !a.deletedAt).toArray(), db.sportItems.filter((i) => !i.deletedAt).toArray()]);
    push([
      ...acts.filter((a) => matchesAll(query, a.title, a.location, a.opponent, a.score, a.difficulties, a.evolution, a.notes)).map((a) => ({ key: `sa:${a.id}`, group: 'sports' as const, type: a.type, label: a.title || a.opponent || a.location || a.score, date: a.date, snippet: snippetFor(query, `${a.notes} ${a.evolution}`), path: `/sports/${a.sportId}` })),
      ...items.filter((i) => matchesAll(query, i.name, i.difficulties, i.notes)).map((i) => ({ key: `si:${i.id}`, group: 'sports' as const, type: i.category, label: i.name, date: null, snippet: snippetFor(query, i.notes), path: `/sports/${i.sportId}` })),
    ]);
  }
  if (on('focus')) {
    const sessions = await db.focusSessions.filter((s) => !s.deletedAt && !!s.notes).toArray();
    push(sessions.filter((s) => matchesAll(query, s.notes)).map((s) => ({ key: `fs:${s.id}`, group: 'focus', type: 'focusSession', label: `${s.actualMin} min`, date: s.date, snippet: snippetFor(query, s.notes), path: '/focus' })));
  }
  if (on('library')) {
    const items = await db.libraryItems.filter((i) => !i.deletedAt).toArray();
    push(
      items
        .filter((i) => matchesAll(query, i.title, i.author, i.category, i.folder, i.fileName, i.tags.join(' '), i.notes, i.textContent))
        .map((i) => ({ key: `lb:${i.id}`, group: 'library', type: i.kind, label: i.title, date: day(i.importedAt), snippet: snippetFor(query, `${i.notes} ${i.textContent ?? ''}`) || i.tags.map((x) => `#${x}`).join(' '), path: `/library?q=${encodeURIComponent(i.title)}` })),
    );
  }
  if (on('inbox')) {
    const items = await db.inbox.filter((i) => !i.deletedAt && !i.processedTo).toArray();
    push(items.filter((i) => matchesAll(query, i.text, i.url, i.fileName)).map((i) => ({ key: `in:${i.id}`, group: 'inbox', type: i.kind, label: (i.text || i.url || i.fileName || '').slice(0, 80), date: day(i.createdAt), snippet: '', path: '/inbox' })));
  }
  if (on('finance')) {
    const [assets, journal, terms] = await Promise.all([db.finAssets.filter((a) => !a.deletedAt).toArray(), db.finJournal.filter((j) => !j.deletedAt).toArray(), db.finTerms.filter((x) => !x.deletedAt).toArray()]);
    push([
      ...assets.filter((a) => matchesAll(query, a.name, a.ticker, a.custody, a.notes)).map((a) => ({ key: `fa:${a.id}`, group: 'finance' as const, type: 'asset', label: a.ticker ? `${a.name} · ${a.ticker}` : a.name, date: null, snippet: '', path: `/finance/assets/${a.id}` })),
      ...journal.filter((j) => matchesAll(query, j.decision, j.justification, j.learning)).map((j) => ({ key: `fj:${j.id}`, group: 'finance' as const, type: 'journal', label: j.decision, date: j.date, snippet: snippetFor(query, j.learning || j.justification), path: '/finance' })),
      ...terms.filter((x) => matchesAll(query, x.term, x.definition)).map((x) => ({ key: `ft:${x.id}`, group: 'finance' as const, type: 'term', label: x.term, date: null, snippet: snippetFor(query, x.definition), path: '/finance' })),
    ]);
  }
  return out;
}

