# Gestão Impressão 3D — app estático

Este repositório contém um app frontend (HTML/CSS/JS) para gerenciar filamentos, registrar vendas e construir um catálogo de produtos. Foi pensado para ser hospedado em GitHub Pages e usar Supabase como backend (autenticação e tabelas). Também há um fallback local usando `localStorage` para testar sem Supabase.

Passos rápidos:

1. Crie um projeto no Supabase e copie `URL` e `ANON KEY`.
2. No arquivo `js/app.js` verifique que `SUPABASE_URL` e `SUPABASE_ANON_KEY` estejam preenchidos (já adicionei suas chaves).
3. No Supabase SQL Editor rode `sql/schema.sql` para criar as tabelas.
4. No painel do Supabase, em Authentication → Settings, confirme que "Enable email signups" está ativo (padrão é ativo).
5. Abra `index.html` em um navegador (ou sirva com um servidor estático). Use o formulário de "Entrar / Registrar" para criar uma conta (signup).
	- Após criar a conta, faça login e você verá as seções para adicionar filamentos e registrar vendas.
6. Para publicar: crie um repositório no GitHub, envie os arquivos e habilite GitHub Pages na branch `main` (root).

Primeiro cadastro (passo-a-passo mínimo):

- Abra o SQL Editor do Supabase e cole o conteúdo de `sql/schema.sql`, execute para criar tabelas.
- Confirme em Authentication → Settings que signups por email estão permitidos.
- Abra `index.html` localmente e registre um usuário pelo formulário de signup.
- Faça login e vá em "Filamentos" → preencha o formulário e clique em "Adicionar / Atualizar" para criar o primeiro filamento.

Storage (imagens):

- Eu recomendo manter os buckets privados para controle total. O frontend agora envia arquivos para o bucket `filament-photos` e armazena o nome do arquivo no campo `photo`.

- Para que imagens privadas funcionem no navegador, faça uma das opções abaixo:
	- Mantê-los privados e permitir leitura apenas para usuários autenticados: em Storage → Rules, ajuste a política para permitir leitura a usuários autenticados (recommended). O frontend fará download autenticado dos blobs usando `sb.storage.download()` quando o usuário estiver logado.
	- Tornar o bucket público (mais simples) — nesse caso `getPublicUrl()` funciona.

- No painel do Supabase:
	- Crie o bucket `filament-photos` (private is fine).
	- (Opcional) Crie `product-photos` se quiser fotos de produtos.

Observação: o frontend aplicará fallback para base64 se o upload ou o download falharem.


Observação: se preferir testar sem enviar emails, você pode criar um usuário diretamente no SQL Editor com `auth.users` (somente para testes), mas o método recomendado é usar o formulário de signup.

Observações:

- O app exige login para uso. Se não configurar Supabase, o app funciona com `localStorage` (apenas local).
- Upload de imagens é salvo como base64 no campo `photo` (para simplificar). Se preferir, configure o Storage do Supabase e adapte `js/app.js`.
- Fique à vontade para pedir que eu faça o commit inicial para você.
