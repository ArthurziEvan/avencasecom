# Imagem oficial do Playwright já vem com Chromium e todas as dependências
# do sistema instaladas — evita erros comuns de "faltando biblioteca X"
# que acontecem tentando instalar tudo manualmente.
FROM mcr.microsoft.com/playwright/python:v1.62.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# O Render (e a maioria dos serviços de nuvem) injeta a porta certa
# na variável de ambiente PORT.
ENV PORT=5000
EXPOSE 5000

# gunicorn é o servidor de produção: mais estável e rápido que o
# servidor de desenvolvimento do Flask usado em "python app.py".
#
# --workers 1: cada worker abre um Chromium por vez, que já consome bastante
#   memória sozinho. No plano gratuito do Render (512 MB), 1 worker é o
#   mais seguro — pedidos simultâneos ficam na fila em vez de travar o serviço.
#   Se migrar para um plano com mais RAM, pode aumentar esse número.
# --threads 4: dentro do worker, atende várias requisições (páginas, downloads)
#   sem precisar abrir vários Chromiums ao mesmo tempo.
# --timeout 120: dá tempo do Playwright carregar páginas mais lentas.
CMD gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120 app:app
