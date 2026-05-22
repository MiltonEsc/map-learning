import cv2

for i in range(4):
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        ret, frame = cap.read()
        shape = frame.shape if ret else "sin frame"
        print(f"Camara {i}: OK - {shape}")
        cap.release()
    else:
        print(f"Camara {i}: no disponible")
