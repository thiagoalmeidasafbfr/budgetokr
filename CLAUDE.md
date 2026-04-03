# CLAUDE.md — Instruções para Claude Code

## Ambiente de execução

- Este projeto roda em um ambiente sandbox **sem acesso à internet**
- O diretório `node_modules` **não está disponível** neste ambiente
- **NUNCA execute** `npm install`, `npm run dev`, `npm run build`, `npm run lint` ou qualquer outro comando npm/node
- Não tente compilar ou verificar tipos TypeScript via linha de comando
- Não execute o servidor Next.js

## Como trabalhar neste projeto

- Edite arquivos diretamente usando as ferramentas de edição de arquivo
- Use leitura de arquivo para entender o código antes de modificar
- Commit e push das alterações via git (git funciona normalmente)
- Não é necessário rodar o projeto para implementar features

## Estrutura do projeto

```
app/          - Páginas e rotas Next.js (App Router)
components/   - Componentes React reutilizáveis
lib/          - Utilitários, queries, tipos e helpers
supabase/     - Schema SQL e funções do banco de dados
middleware.ts - Middleware de autenticação
```

## Stack

- **Next.js 16** com App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (PostgreSQL + Auth via iron-session)
- **Recharts** para gráficos
- **Zustand** para estado global

## Arquivos grandes — atenção ao contexto

**NUNCA leia esses arquivos inteiros.** Use sempre `Grep` para localizar o trecho exato antes de usar `Read` com `offset` e `limit`:

| Arquivo | Linhas |
|---|---|
| `app/dept/page.tsx` | ~2.160 |
| `app/dre-gerencial/page.tsx` | ~1.863 |
| `app/dre/page.tsx` | ~1.518 |
| `components/ExecCharts.tsx` | ~1.050 |
| `app/analise/page.tsx` | ~956 |
| `app/admin/users/page.tsx` | ~847 |
| `app/unidades-negocio/page.tsx` | ~658 |
| `lib/query.ts` | ~623 |
| `app/medidas/page.tsx` | ~575 |
| `app/plano-contas/page.tsx` | ~563 |
| `app/one-page-financeiro/page.tsx` | ~537 |
| `app/por-unidade/page.tsx` | ~533 |
| `app/admin/comments/page.tsx` | ~531 |
| `components/DreDetalhamentoModal.tsx` | ~692 |

### Fluxo obrigatório para editar arquivos grandes:
1. `Grep` para encontrar a linha exata do trecho
2. `Read` com `offset` (linha - 10) e `limit` (~80 linhas)
3. `Edit` com o trecho exato encontrado
4. **Nunca use `Read` sem `limit` nesses arquivos**

## Padrões do projeto

- Autenticação via `iron-session` (ver `lib/session.ts`)
- Dados do Supabase acessados via `lib/query.ts` e `lib/db.ts`
- Controle de acesso por `user.role` (admin/user) e `user.centros[]`/`user.unidades[]`
- API routes em `app/api/*/route.ts`
