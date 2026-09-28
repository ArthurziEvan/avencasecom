import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Cria o superusuário a partir das variáveis ADMIN_USER e ADMIN_PASSWORD, se ainda não existir."

    def handle(self, *args, **options):
        usuario = os.environ.get("ADMIN_USER")
        senha = os.environ.get("ADMIN_PASSWORD")
        if not usuario or not senha:
            self.stdout.write("ADMIN_USER/ADMIN_PASSWORD não definidos; nada a fazer.")
            return
        if User.objects.filter(username=usuario).exists():
            self.stdout.write(f"Usuário {usuario} já existe.")
            return
        User.objects.create_superuser(usuario, "", senha)
        self.stdout.write(f"Superusuário {usuario} criado.")
