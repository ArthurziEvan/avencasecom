from django.contrib import admin
from .models import ComentarioAvenca


@admin.register(ComentarioAvenca)
class ComentarioAdmin(admin.ModelAdmin):
    list_display = ("id_avenca_senado", "autor", "data_controle_interna", "data_criacao", "foi_editado")
    list_filter = ("autor", "foi_editado")
    search_fields = ("id_avenca_senado", "texto")
