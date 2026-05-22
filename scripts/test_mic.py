"""
Prueba el ciclo completo: micrófono → Whisper → GPT → voz.
Requiere que main.py esté corriendo en otra terminal.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from voice.assistant import handle_voice_query

print("Prueba de micrófono — tienes 5 segundos para hablar.")
print("Pregunta algo como: 'Como esta el trafico para ir a la oficina?'")
print()

respuesta = handle_voice_query(duration_sec=5)
print(f"\nRespuesta dada: {respuesta}")
