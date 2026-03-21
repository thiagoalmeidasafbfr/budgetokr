import { getDb } from './db'

export function logAudit(
  tabela: string,
  registroId: number | null,
  acao: 'INSERT' | 'UPDATE' | 'DELETE',
  campo: string | null,
  valorAnterior: string | null,
  valorNovo: string | null,
  usuario: string | null,
) {
  const db = getDb()
  db.prepare(`
    INSERT INTO audit_log (tabela, registro_id, acao, campo, valor_anterior, valor_novo, usuario)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tabela, registroId, acao, campo, valorAnterior, valorNovo, usuario)
}

export function logBulkAudit(
  tabela: string,
  registroId: number | null,
  acao: 'INSERT' | 'UPDATE' | 'DELETE',
  changes: Record<string, { old: unknown; new: unknown }>,
  usuario: string | null,
) {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO audit_log (tabela, registro_id, acao, campo, valor_anterior, valor_novo, usuario)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const [campo, vals] of Object.entries(changes)) {
      stmt.run(tabela, registroId, acao, campo, String(vals.old ?? ''), String(vals.new ?? ''), usuario)
    }
  })
  tx()
}
