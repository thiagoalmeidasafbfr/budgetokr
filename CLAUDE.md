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

Leia apenas as partes necessárias desses arquivos:
- `app/dept/page.tsx` — 2.075 linhas
- `app/dre/page.tsx` — 1.476 linhas
- `lib/query.ts` — 622 linhas
- `components/DreDetalhamentoModal.tsx` — 692 linhas

## Padrões do projeto

- Autenticação via `iron-session` (ver `lib/session.ts`)
- Dados do Supabase acessados via `lib/query.ts` e `lib/db.ts`
- Controle de acesso por `user.role` (admin/user) e `user.centros[]`/`user.unidades[]`
- API routes em `app/api/*/route.ts`
