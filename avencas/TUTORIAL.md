# Tutorial: colocar no ar sem rodar nada no computador

Você só usa o navegador: Supabase (banco) + GitHub (código) + Render (site).

## Parte 1 – Supabase (banco)
1. Crie conta em supabase.com > New project. Guarde a senha do banco.
2. Clique em **Connect** (topo) > aba **Session pooler** > copie a string e troque [YOUR-PASSWORD] pela senha.
   Ela é a sua DATABASE_URL.

## Parte 2 – GitHub (código)
1. Crie conta em github.com > New repository, nome `avencas`, **Private**, sem README.
2. Descompacte o avencas.zip no seu computador.
3. Na página do repositório: **uploading an existing file**.
4. Abra a pasta descompactada e arraste **o conteúdo dela** (as pastas `backend`, `frontend` e os arquivos
   `README.md`, `TUTORIAL.md`, `.gitignore`) para a página. Não arraste a pasta `avencas` em si.
   Se o `.gitignore` não aparecer no explorador, ative "exibir arquivos ocultos".
5. Confira que existem `backend/manage.py` e `backend/avencas/migrations/0001_initial.py`. Clique em **Commit changes**.

## Parte 3 – Render: backend
1. render.com > entre com o GitHub > **New > Web Service** > escolha `avencas`.
2. Configure:
   - Root Directory: `backend`
   - Language/Runtime: Python 3
   - Build Command:
     `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate && python manage.py criar_admin`
   - Start Command: `gunicorn core.wsgi`
   - Instance: Free (ou paga)
3. **Environment Variables**:
   | Nome | Valor |
   |---|---|
   | SECRET_KEY | qualquer texto longo e aleatório |
   | DEBUG | False |
   | DATABASE_URL | a string do Supabase |
   | SENADO_CONTRATOS_URL | https://adm.senado.gov.br/adm-dadosabertos/api/v1/contratacoes/contratos |
   | ADMIN_USER | seu usuário (ex.: admin) |
   | ADMIN_PASSWORD | uma senha forte |
4. **Create Web Service**. Aguarde "Live". Anote o endereço (ex.: https://avencas-api.onrender.com).
5. Teste abrir `https://SEU-BACKEND.onrender.com/admin/` e entrar com ADMIN_USER/ADMIN_PASSWORD.
   Em **Users > Add** crie as contas dos auditores.

## Parte 4 – Render: frontend
1. **New > Static Site** > repositório `avencas`.
2. Configure:
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
3. Environment Variable: `VITE_API` = `https://SEU-BACKEND.onrender.com/api/v1`
4. **Create Static Site**. O endereço final (ex.: https://avencas.onrender.com) é o link que você compartilha.

## Parte 5 – Liberar o frontend no backend (CORS)
No Web Service do backend > Environment > adicione `CORS_EXTRA` = endereço do frontend, sem barra no final
(ex.: `https://avencas.onrender.com`). Salve; o Render reinicia.

## Parte 6 – Conferir os dados do Senado
1. Entre em `https://SEU-BACKEND.onrender.com/admin/` com o admin.
2. Para ver o retorno bruto da API, use `/api/v1/debug-senado/` (exige token; se preferir, me mande print
   da tela de contratos do sistema e eu ajusto os nomes dos campos em `avencas/views.py`, função `normalizar`).

## Atualizar depois
No GitHub, abra o arquivo > lápis (Edit) > Commit. O Render republica sozinho.

## Problemas comuns
- Login falha / "Failed to fetch": faltou CORS_EXTRA, ou VITE_API errado (precisa terminar em /api/v1).
- Site demora no primeiro acesso: plano gratuito do Render "dorme" após inatividade.
- Erro no build do backend: abra a aba **Logs** e me envie o texto.
