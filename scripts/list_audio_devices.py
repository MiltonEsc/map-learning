import sounddevice as sd

print("Dispositivos de audio disponibles:\n")
devices = sd.query_devices()
for i, d in enumerate(devices):
    tipo = []
    if d['max_input_channels'] > 0:
        tipo.append("ENTRADA (microfono)")
    if d['max_output_channels'] > 0:
        tipo.append("SALIDA (altavoz)")
    print(f"[{i}] {d['name']} — {', '.join(tipo)}")

print(f"\nDispositivo de entrada por defecto: [{sd.default.device[0]}] {devices[sd.default.device[0]]['name']}")
print(f"Dispositivo de salida por defecto:  [{sd.default.device[1]}] {devices[sd.default.device[1]]['name']}")
print("\nPon el numero de tu microfono en MIC_DEVICE_INDEX en el .env")
