from django.contrib.auth.models import User
from django.db import models


class ComentarioAvenca(models.Model):
    id_avenca_senado = models.CharField(max_length=50, db_index=True)
    autor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="comentarios_avencas")
    texto = models.TextField()
    data_controle_interna = models.DateField(null=True, blank=True)
    data_criacao = models.DateTimeField(auto_now_add=True)
    data_modificacao = models.DateTimeField(auto_now=True)
    foi_editado = models.BooleanField(default=False)

    class Meta:
        ordering = ["-data_criacao"]

    def __str__(self):
        return f"{self.id_avenca_senado} - {self.autor}"
