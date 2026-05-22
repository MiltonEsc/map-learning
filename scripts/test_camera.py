"""
Prueba la cámara configurada en CAMERA_SOURCE:
- Captura un frame
- Corre YOLOv8
- Guarda la imagen anotada en scripts/test_output.jpg
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from camera.capture import get_frame
from ml.cv_model import detect_vehicles, frame_to_jpeg

print("Capturando frame...")
frame = get_frame()
if frame is None:
    print("ERROR: no se pudo obtener frame")
    sys.exit(1)

print(f"Frame OK: {frame.shape}")
print("Corriendo YOLOv8...")

result = detect_vehicles(frame)
print(f"Vehiculos detectados: {result['vehicle_count']}")
print(f"Congestion score:     {result['congestion_score']}")
print(f"Nivel:                {result['level']}")

out_path = os.path.join(os.path.dirname(__file__), "test_output.jpg")
with open(out_path, "wb") as f:
    f.write(frame_to_jpeg(result["annotated_frame"]))
print(f"Imagen anotada guardada en: {out_path}")
