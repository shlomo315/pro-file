import { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const [message, setMessage] = useState("טוען מערכת זיהוי...");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState<number>(0);

  useEffect(() => {
    loadModel();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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
      setMessage("לחץ Start Camera");
    } catch (error) {
      console.error(error);
      setMessage("שגיאה בטעינת זיהוי הפנים");
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStarted(true);
      setMessage("המצלמה פועלת ✅");

      if (faceLandmarker) {
        startGuidanceLoop();
      }
    } catch (error) {
      console.error(error);
      setMessage("לא הצלחתי לפתוח מצלמה");
    }
  };

  const stopCamera = () => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    }

    setCameraStarted(false);
  };

  const getBrightness = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return 0;

    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;

    const sampleWidth = 120;
    const sampleHeight = 160;

    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);

    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;

    let total = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      total += (r + g + b) / 3;
    }

    const avg = total / (imageData.length / 4);
    return avg;
  };

  const startGuidanceLoop = () => {
    const run = () => {
      if (!videoRef.current || !faceLandmarker || !cameraStarted) return;

      try {
        const video = videoRef.current;
        const results = faceLandmarker.detectForVideo(video, performance.now());
        const brightness = getBrightness();
        setBrightnessLevel(brightness);

        if (!results.faceLandmarks.length) {
          setMessage("תמקם את הפנים בתוך המסגרת");
          animationRef.current = requestAnimationFrame(run);
          return;
        }

        const face = results.faceLandmarks[0];

        const nose = face[1];
        const leftCheek = face[234];
        const rightCheek = face[454];
        const forehead = face[10];
        const chin = face[152];

        const faceCenterX = nose.x;
        const faceHeight = Math.abs(chin.y - forehead.y);
        const leftWidth = Math.abs(nose.x - leftCheek.x);
        const rightWidth = Math.abs(rightCheek.x - nose.x);

        const centerTolerance = 0.08;
        const yawTolerance = 0.025;

        const faceTop = forehead.y;
        const faceBottom = chin.y;
        const faceMidY = (faceTop + faceBottom) / 2;

        if (faceCenterX < 0.42 - centerTolerance) {
          setMessage("תזיז את הפנים קצת ימינה");
        } else if (faceCenterX > 0.58 + centerTolerance) {
          setMessage("תזיז את הפנים קצת שמאלה");
        } else if (leftWidth > rightWidth + yawTolerance) {
          setMessage("תסובב קצת ימינה");
        } else if (rightWidth > leftWidth + yawTolerance) {
          setMessage("תסובב קצת שמאלה");
        } else if (nose.y < faceMidY - 0.03) {
          setMessage("תוריד קצת סנטר");
        } else if (nose.y > faceMidY + 0.03) {
          setMessage("תרים קצת סנטר");
        } else if (faceHeight < 0.30) {
          setMessage("תתקרב קצת למצלמה");
        } else if (brightness < 85) {
          setMessage("התאורה חלשה — תפנה את הפנים לאור");
        } else if (brightness > 210) {
          setMessage("יש יותר מדי אור — תזוז קצת מהאור");
        } else {
          setMessage("מושלם — עכשיו תצלם ✅");
        }
      } catch (error) {
        console.error(error);
      }

      animationRef.current = requestAnimationFrame(run);
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(run);
  };

  const takePhoto = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        setMessage("אין מצלמה פעילה");
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setMessage("לא הצלחתי לצלם");
        return;
      }

      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 960;

      let brightnessBoost = 1.05;
      let contrastBoost = 1.05;
      let saturateBoost = 1.03;

      if (brightnessLevel < 90) {
        brightnessBoost = 1.22;
        contrastBoost = 1.08;
        saturateBoost = 1.05;
      }

      if (brightnessLevel > 190) {
        brightnessBoost = 0.95;
        contrastBoost = 1.02;
        saturateBoost = 1.02;
      }

      ctx.filter = `brightness(${brightnessBoost}) contrast(${contrastBoost}) saturate(${saturateBoost})`;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      const imageData = canvas.toDataURL("image/png");
      setCapturedImage(imageData);
      setMessage("התמונה צולמה ונשמרה בתצוגה ✅");
    } catch (error) {
      console.error(error);
      setMessage("לא הצלחתי לצלם תמונה");
    }
  };

  const downloadPhoto = () => {
    if (!capturedImage) {
      setMessage("אין תמונה להורדה");
      return;
    }

    const link = document.createElement("a");
    link.href = capturedImage;
    link.download = "best-angle-photo.png";
    link.click();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f3f4f6",
        fontFamily: "Arial, sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 370,
          background: "white",
          borderRadius: 24,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Best Angle App</h1>

        <div
          style={{
            width: "100%",
            aspectRatio: "3 / 4",
            overflow: "hidden",
            borderRadius: 18,
            background: "#dbe3ef",
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

        <p
          style={{
            minHeight: 28,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 8,
          }}
        >
          {message}
        </p>

        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
          תאורה: {Math.round(brightnessLevel)}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={startCamera}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Start Camera
          </button>

          <button
            onClick={takePhoto}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Take Photo
          </button>

          <button
            onClick={downloadPhoto}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#16a34a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Download
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {capturedImage && (
          <div style={{ marginTop: 16 }}>
            <h3>Captured Image</h3>
            <img
              src={capturedImage}
              alt="Captured"
              style={{ width: "100%", borderRadius: 16 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}