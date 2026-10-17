from django.contrib import admin
from django.urls import path, re_path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, FileResponse
import mimetypes
from pathlib import Path

def serve_spa(request, path=''):
    frontend_dir = Path(settings.FRONTEND_DIR)
    
    # 1. If path points to an actual file in frontend/dist (e.g. assets/..., favicon.svg, icons.svg)
    if path:
        target_file = (frontend_dir / path).resolve()
        # Security check: ensure target_file is within frontend_dir
        if str(target_file).startswith(str(frontend_dir.resolve())) and target_file.exists() and target_file.is_file():
            content_type, _ = mimetypes.guess_type(str(target_file))
            return FileResponse(open(target_file, 'rb'), content_type=content_type or 'application/octet-stream')
    
    # 2. Otherwise serve index.html for SPA routes (e.g. '', 'pos', 'inventory', 'sales', 'shifts', 'settings')
    index_file = frontend_dir / 'index.html'
    if index_file.exists():
        return HttpResponse(open(index_file, 'r', encoding='utf-8').read(), content_type='text/html')
        
    return HttpResponse(
        "<h1>Frontend not found</h1><p>Please build the frontend inside the frontend folder.</p>",
        status=404
    )

from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    # Swagger / ReDoc docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # API endpoints
    path('api/', include('api.urls')),

    # Media and Static files explicitly served
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),

    # SPA fallback
    re_path(r'^(?P<path>.*)$', serve_spa),
]

