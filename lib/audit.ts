import { getSupabase } from './supabase'

export async function logAudit(
  tabela: string,
  registroId: number | null,
  acao: 'INSERT' | 'UPDATE' | 'DELETE',
  campo: string | null,
  valorAnterior: string | null,
  valorNovo: string | null,
  usuario: string | null,
) {
  try {
    const supabase = getSupabase()
    await supabase.from('audit_log').insert({
      tabela,
      registro_id: registroId,
      acao,
      campo,
      valor_anterior: valorAnterior,
      valor_novo: valorNovo,
      usuario,
    })
  } catch { /* non-blocking */ }
}

export async function logBulkAudit(
  tabela: string,
  registroId: number | null,
  acao: 'INSERT' | 'UPDATE' | 'DELETE',
  changes: Record<string, { old: unknown; new: unknown }>,
  usuario: string | null,
) {
  try {
    const supabase = getSupabase()
    const rows = Object.entries(changes).map(([campo, vals]) => ({
      tabela,
      registro_id: registroId,
      acao,
      campo,
      valor_anterior: String(vals.old ?? ''),
      valor_novo: String(vals.new ?? ''),
      usuario,
    }))
    if (rows.length) await supabase.from('audit_log').insert(rows)
  } catch { /* non-blocking */ }
}
