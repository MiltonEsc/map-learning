"""
Script de diagnóstico — muestra la respuesta exacta de Google Maps API.
Corre: python scripts/debug_api.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from config.settings import settings

print(f"API Key cargada: {'SI' if settings.google_maps_api_key else 'NO (vacía)'}")
print(f"API Key (primeros 10 chars): {settings.google_maps_api_key[:10]}...")
print(f"URL: {settings.google_maps_base_url}")
print()

headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": settings.google_maps_api_key,
    "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters",
}
body = {
    "origin": {"location": {"latLng": {"latitude": 10.857222867588492, "longitude": -74.77208724641312}}},
    "destination": {"location": {"latLng": {"latitude": 10.930436691820809, "longitude": -74.85466013428844}}},
    "travelMode": "DRIVE",
    "routingPreference": "TRAFFIC_AWARE",
}

print("Llamando a Google Routes API...")
with httpx.Client(timeout=15) as client:
    resp = client.post(settings.google_maps_base_url, json=body, headers=headers)
    print(f"HTTP Status: {resp.status_code}")
    data = resp.json()
    if resp.status_code == 200 and data.get("routes"):
        best = data["routes"][0]
        duration_sec = int(best.get("staticDuration", "0s").rstrip("s"))
        duration_in_traffic_sec = int(best.get("duration", "0s").rstrip("s"))
        distance_m = int(best.get("distanceMeters", 0))
        print(f"Duración normal:      {duration_sec // 60} min")
        print(f"Duración con tráfico: {duration_in_traffic_sec // 60} min")
        print(f"Distancia:            {distance_m / 1000:.1f} km")
        print("¡Routes API funcionando correctamente!")
    else:
        print(f"Respuesta: {resp.text}")
