# Controle de Avenças – Senado Federal

Django REST (backend) + React/Vite/Tailwind (frontend) + Supabase (só o Postgres).
Fonte dos contratos: https://adm.senado.gov.br/adm-dadosabertos  (GET /api/v1/contratacoes/contratos)

## 1. Supabase
Crie um projeto. Em "Connect" copie a string do **Session pooler** (porta 5432) e use em DATABASE_URL.

## 2. Backend
    cd backend
    python -m venv venv
    source venv/bin/activate          # Windows: venv\Scripts\activate
    pip install -r requirements.txt
    cp .env.example .env              # edite SECRET_KEY e DATABASE_URL
    python manage.py makemigrations avencas
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py runserver

Crie os auditores em http://localhost:8000/admin  (Users > Add).

### Conferir os campos do Senado
Logado como superusuário, abra /api/v1/debug-senado/ com o header
`Authorization: Token <seu token>` (ou use o admin/DRF). Ele mostra o item bruto e como
ficou normalizado. Se algum campo vier vazio, ajuste `normalizar()` em avencas/views.py.

## 3. Frontend
    cd frontend
    cp .env.example .env
    npm install
    npm run dev                       # http://localhost:5173

## 4. Publicar (gerar o link)
- Backend (Render): veja TUTORIAL.md
  start `gunicorn core.wsgi`. Variáveis: SECRET_KEY, DATABASE_URL, SENADO_CONTRATOS_URL,
  CORS_EXTRA=https://SEU-FRONT.vercel.app  (DEBUG=False). Root directory: backend.
- Frontend (Vercel/Netlify): root `frontend`, variável VITE_API=https://SEU-BACK.onrender.com/api/v1.
  O endereço da Vercel é o link que você compartilha.

## 5. Manutenção
- Alterou models.py: `makemigrations` + `migrate` e git push.
- Backup: `pg_dump` periódico (o histórico de pareceres é o dado valioso).
- Cache da lista do Senado: 1h (ajuste em views.py, `cache.set`).
