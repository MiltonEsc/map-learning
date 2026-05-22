"""
Prueba el asistente de voz con texto (sin micrófono).
Requiere que main.py esté corriendo en otra terminal.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from voice.assistant import ask
from voice.tts import speak

preguntas = [
    "Como esta el trafico para ir a la oficina ahora?",
    "Debo salir ahora o esperar un poco?",
    "Cuanto tiempo me va a tomar llegar?",
]

for pregunta in preguntas:
    print(f"\nPregunta: {pregunta}")
    respuesta = ask(pregunta)
    print(f"Respuesta: {respuesta}")
    speak(respuesta)
    input("Presiona Enter para la siguiente pregunta...")
