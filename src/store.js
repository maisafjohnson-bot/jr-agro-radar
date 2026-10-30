// Armazenamento persistente em arquivos JSON versionados no Git.
// Cada indicador tem seu histórico completo; nada é sobrescrito sem registro.
import fs from 'node:fs';
import path from 'node:path';

export function createStore(root) {
  const obsDir = path.join(root, 'data', 'observations');
  fs.mkdirSync(obsDir, { recursive: true });
  const file = id => path.join(obsDir, `${id}.json`);

  return {
    root,
    load(id) {
      try { return JSON.parse(fs.readFileSync(file(id), 'utf8')).observacoes || []; }
      catch { return []; }
    },
    loadAll(ids) {
      const out = {};
      for (const id of ids) out[id] = this.load(id);
      return out;
    },
    /** Mescla por data. Retorna {novas, alteradas}. Valor alterado é registrado em 'revisoes'. */
    merge(id, incoming) {
      const cur = this.load(id);
      const chave = o => `${o.data}|${o.ano_referencia ?? ''}`; // Focus: mesma data, anos de referência diferentes
      const byDate = new Map(cur.map(o => [chave(o), o]));
      let novas = 0, alteradas = 0;
      for (const o of incoming) {
        if (typeof o.valor !== 'number' || !Number.isFinite(o.valor)) continue; // nunca grava lixo/zero falso
        const old = byDate.get(chave(o));
        if (!old) { byDate.set(chave(o), o); novas++; }
        else if (old.valor !== o.valor) {
          byDate.set(chave(o), { ...o, revisoes: [...(old.revisoes || []), { valor_anterior: old.valor, substituido_em: o.coletado_em }] });
          alteradas++;
        }
      }
      const obs = [...byDate.values()].sort((a, b) => a.data.localeCompare(b.data));
      fs.writeFileSync(file(id), JSON.stringify({ indicador: id, observacoes: obs }, null, 0));
      return { novas, alteradas, total: obs.length };
    },
    appendLine(rel, obj) {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.appendFileSync(p, JSON.stringify(obj) + '\n');
    },
    readLines(rel) {
      try { return fs.readFileSync(path.join(root, rel), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); }
      catch { return []; }
    },
    readJSON(rel) {
      try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return null; }
    },
    writeJSON(rel, obj) {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(obj, null, 1));
    },
    writeText(rel, txt) {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, txt);
    }
  };
}
