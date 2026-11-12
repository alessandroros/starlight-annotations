import { describe, expect, it } from 'vitest';
import { builtIn, strings } from '../src/client/i18n.js';

describe('strings', () => {
  it('has every English key in every built-in language', () => {
    const keys = Object.keys(builtIn.en).sort();
    for (const [lang, table] of Object.entries(builtIn)) expect(Object.keys(table).sort(), lang).toEqual(keys);
  });
  it('picks the language by its first subtag and falls back to English', () => {
    expect(strings('it-IT').annotate).toBe('Annota');
    expect(strings('ja').annotate).toBe('Annotate');
  });
  it('applies overrides by language, then by full tag', () => {
    const T = strings('pt-BR', { en: { notes: 'Comments' }, pt: { annotate: 'Anotar' }, 'pt-br': { save: 'Salvar' } });
    expect([T.notes, T.annotate, T.save]).toEqual(['Comments', 'Anotar', 'Salvar']);
  });
});
