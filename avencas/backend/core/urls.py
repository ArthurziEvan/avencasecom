from django.contrib import admin
from django.urls import path
from rest_framework.authtoken.views import obtain_auth_token
from avencas import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/login/", obtain_auth_token),
    path("api/v1/me/", views.Me.as_view()),
    path("api/v1/contratos-vigentes/", views.ContratosVigentes.as_view()),
    path("api/v1/debug-senado/", views.DebugSenado.as_view()),
    path("api/v1/comentarios/", views.ComentarioCreate.as_view()),
    path("api/v1/comentarios/<int:pk>/", views.ComentarioDetail.as_view()),
]
