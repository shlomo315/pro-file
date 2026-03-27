import { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runningRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const [message, setMessage] = useState("טוען מודל...");
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);

  useEffect(() => {
    loadModel();

    return () => {
      stopCamera();
    };
  }, []);

  const loadModel = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });

      setFaceLandmarker(landmarker);
      setMessage("לחץ Start");
    } catch (error) {
      setMessage("שגיאה בטעינת מודל זיהוי הפנים");
      console.error(error);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      runningRef.current = true;
      setMessage("מפעיל זיהוי פנים...");
      detectFace();
    } catch (error) {
      setMessage("לא הצלחתי לפתוח מצלמה");
      console.error(error);
    }
  };

  const stopCamera = () => {
    runningRef.current = false;

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  };

  const detectFace = () => {
    if (!videoRef.current || !faceLandmarker) {
      setMessage("המודל עדיין לא מוכן");
      return;
    }

    const check = () => {
      if (!videoRef.current || !faceLandmarker || !runningRef.current) return;

      const results = faceLandmarker.detectForVideo(
        videoRef.current,
        performance.now()
      );

      if (results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];

        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const nose = landmarks[1];
        const forehead = landmarks[10];
        const chin = landmarks[152];

        const faceWidthLeft = Math.abs(nose.x - leftCheek.x);
        const faceWidthRight = Math.abs(rightCheek.x - nose.x);
        const faceHeight = Math.abs(chin.y - forehead.y);

        if (faceWidthLeft > faceWidthRight + 0.02) {
          setMessage("תסובב קצת ימינה");
        } else if (faceWidthRight > faceWidthLeft + 0.02) {
          setMessage("תסובב קצת שמאלה");
        } else if (faceHeight < 0.34) {
          setMessage("תקרב את הפנים קצת");
        } else {
          setMessage("מעולה — תישאר ככה");
        }
      } else {
        setMessage("לא מזהה פנים");
      }

      frameRef.current = requestAnimationFrame(check);
    };

    check();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f6fb",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: 360,
          background: "#fff",
          borderRadius: 24,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1>Best Angle App</h1>

        <div
          style={{
            width: "100%",
            aspectRatio: "3/4",
            background: "#dfe6ef",
            borderRadius: 18,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
        </div>

        <p style={{ minHeight: 24 }}>{message}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={startCamera}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Start
          </button>

          <button
            onClick={stopCamera}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}