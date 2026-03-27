import { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

type CandidateFrame = {
  imageData: string;
  score: number;
  brightness: number;
  message: string;
  timestamp: number;
};

type AnalysisResult = {
  score: number;
  message: string;
  brightness: number;
  ready: boolean;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const collectionTimeoutRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef<number>(0);
  const candidatesRef = useRef<CandidateFrame[]>([]);

  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [message, setMessage] = useState("טוען מערכת AI...");
  const [score, setScore] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [framesCollected, setFramesCollected] = useState(0);

  useEffect(() => {
    loadModel();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (collectionTimeoutRef.current) window.clearTimeout(collectionTimeoutRef.current);
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (cameraStarted && faceLandmarker) {
      startAnalysisLoop();
    }
  }, [cameraStarted, faceLandmarker]);

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
        outputFaceBlendshapes: true,
      });

      setFaceLandmarker(landmarker);
      setMessage("לחץ Start Camera");
    } catch (error) {
      console.error(error);
      setMessage("שגיאה בטעינת AI");
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
    setIsCollecting(false);
  };

  const getBrightness = () => {
    const video = videoRef.current;
    const canvas = sampleCanvasRef.current;

    if (!video || !canvas) return 0;
    if (!video.videoWidth || !video.videoHeight) return 0;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;

    const sampleWidth = 64;
    const sampleHeight = 64;

    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);

    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;

    let total = 0;
    const pixelCount = imageData.length / 4;

    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      total += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    return total / pixelCount;
  };

  const getBlendshapeScore = (results: any, key: string) => {
    const categories = results.faceBlendshapes?.[0]?.categories;
    if (!categories) return 0;
    const found = categories.find((c: any) => c.categoryName === key);
    return found?.score ?? 0;
  };

  const analyzeFrame = (): AnalysisResult => {
    const video = videoRef.current;

    if (!video || !faceLandmarker) {
      return { score: 0, message: "המערכת לא מוכנה", brightness: 0, ready: false };
    }

    const results = faceLandmarker.detectForVideo(video, performance.now());
    const currentBrightness = getBrightness();

    if (!results.faceLandmarks.length) {
      return {
        score: 0,
        message: "תמקם את הפנים מול המצלמה",
        brightness: currentBrightness,
        ready: false,
      };
    }

    const face = results.faceLandmarks[0];

    const nose = face[1];
    const forehead = face[10];
    const chin = face[152];
    const leftCheek = face[234];
    const rightCheek = face[454];

    const faceCenterX = nose.x;
    const faceCenterY = nose.y;
    const faceHeight = Math.abs(chin.y - forehead.y);

    const leftWidth = Math.abs(nose.x - leftCheek.x);
    const rightWidth = Math.abs(rightCheek.x - nose.x);
    const yawDiff = Math.abs(leftWidth - rightWidth);

    const smileLeft = getBlendshapeScore(results, "mouthSmileLeft");
    const smileRight = getBlendshapeScore(results, "mouthSmileRight");
    const blinkLeft = getBlendshapeScore(results, "eyeBlinkLeft");
    const blinkRight = getBlendshapeScore(results, "eyeBlinkRight");

    const smileAvg = (smileLeft + smileRight) / 2;
    const blinkAvg = (blinkLeft + blinkRight) / 2;

    let totalScore = 0;

    const centerScoreX = Math.max(0, 25 - Math.abs(faceCenterX - 0.5) * 120);
    const centerScoreY = Math.max(0, 15 - Math.abs(faceCenterY - 0.5) * 90);
    totalScore += centerScoreX + centerScoreY;

    const distanceScore = Math.max(0, 20 - Math.abs(faceHeight - 0.34) * 120);
    totalScore += distanceScore;

    let angleScore = 0;
    if (yawDiff >= 0.015 && yawDiff <= 0.05) angleScore = 18;
    else if (yawDiff < 0.015) angleScore = 12;
    else if (yawDiff <= 0.08) angleScore = 8;
    totalScore += angleScore;

    let lightScore = 0;
    if (currentBrightness >= 90 && currentBrightness <= 185) lightScore = 20;
    else if (currentBrightness >= 75 && currentBrightness < 90) lightScore = 14;
    else if (currentBrightness > 185 && currentBrightness <= 210) lightScore = 12;
    else if (currentBrightness > 0) lightScore = 6;
    totalScore += lightScore;

    let expressionScore = 0;
    if (smileAvg >= 0.18 && smileAvg <= 0.45) expressionScore = 10;
    else if (smileAvg > 0.05 && smileAvg < 0.18) expressionScore = 7;
    else expressionScore = 5;
    totalScore += expressionScore;

    let eyesScore = 0;
    if (blinkAvg < 0.35) eyesScore = 10;
    else if (blinkAvg < 0.55) eyesScore = 5;
    totalScore += eyesScore;

    const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

    let mainMessage = "זווית טובה — עכשיו תצלם ✅";

    if (faceCenterX < 0.43) {
      mainMessage = "תזיז את הפנים קצת ימינה";
    } else if (faceCenterX > 0.57) {
      mainMessage = "תזיז את הפנים קצת שמאלה";
    } else if (faceCenterY < 0.43) {
      mainMessage = "תוריד קצת סנטר";
    } else if (faceCenterY > 0.57) {
      mainMessage = "תרים קצת סנטר";
    } else if (faceHeight < 0.28) {
      mainMessage = "תתקרב קצת למצלמה";
    } else if (faceHeight > 0.42) {
      mainMessage = "תתרחק קצת מהמצלמה";
    } else if (yawDiff < 0.012) {
      mainMessage = "תסובב מעט את הראש לצד — זה יותר מחמיא";
    } else if (yawDiff > 0.07) {
      mainMessage = "הזווית חזקה מדי — תחזור קצת למרכז";
    } else if (currentBrightness > 0 && currentBrightness < 75) {
      mainMessage = "התאורה חלשה — תפנה את הפנים למקור אור";
    } else if (currentBrightness > 210) {
      mainMessage = "יש יותר מדי אור — תזוז קצת מהאור";
    } else if (blinkAvg > 0.45) {
      mainMessage = "תפתח קצת את העיניים";
    } else if (smileAvg < 0.06) {
      mainMessage = "נסה חיוך קטן או הבעה יותר חיה";
    }

    const ready =
      finalScore >= 78 &&
      faceCenterX >= 0.43 &&
      faceCenterX <= 0.57 &&
      faceCenterY >= 0.43 &&
      faceCenterY <= 0.57 &&
      faceHeight >= 0.28 &&
      faceHeight <= 0.42 &&
      yawDiff >= 0.012 &&
      yawDiff <= 0.07 &&
      currentBrightness >= 75 &&
      currentBrightness <= 210;

    return {
      score: finalScore,
      message: mainMessage,
      brightness: currentBrightness,
      ready,
    };
  };

  const captureCurrentFrame = (analysis: AnalysisResult) => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (!video || !canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;

    let brightnessBoost = 1.04;
    let contrastBoost = 1.06;
    let saturateBoost = 1.04;

    if (analysis.brightness > 0 && analysis.brightness < 90) {
      brightnessBoost = 1.22;
      contrastBoost = 1.08;
      saturateBoost = 1.05;
    }

    if (analysis.brightness > 185) {
      brightnessBoost = 0.96;
      contrastBoost = 1.03;
      saturateBoost = 1.02;
    }

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.filter = `brightness(${brightnessBoost}) contrast(${contrastBoost}) saturate(${saturateBoost})`;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.filter = "none";

    return canvas.toDataURL("image/png");
  };

  const startAnalysisLoop = () => {
    const run = () => {
      if (!videoRef.current || !faceLandmarker || !cameraStarted) return;

      const analysis = analyzeFrame();

      setMessage(analysis.message);
      setScore(analysis.score);
      setBrightness(Math.round(analysis.brightness));

      if (isCollecting && analysis.ready) {
        const now = Date.now();

        if (now - lastSavedAtRef.current > 350) {
          const imageData = captureCurrentFrame(analysis);

          if (imageData) {
            candidatesRef.current.push({
              imageData,
              score: analysis.score,
              brightness: analysis.brightness,
              message: analysis.message,
              timestamp: now,
            });

            setFramesCollected(candidatesRef.current.length);
            lastSavedAtRef.current = now;
          }
        }
      }

      animationRef.current = requestAnimationFrame(run);
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(run);
  };

  const startBestShot = () => {
    if (!cameraStarted) {
      setMessage("תפעיל קודם מצלמה");
      return;
    }

    candidatesRef.current = [];
    lastSavedAtRef.current = 0;
    setFramesCollected(0);
    setIsCollecting(true);
    setCapturedImage(null);
    setMessage("אוסף פריימים טובים... תישאר טבעי");

    if (collectionTimeoutRef.current) {
      window.clearTimeout(collectionTimeoutRef.current);
    }

    collectionTimeoutRef.current = window.setTimeout(() => {
      setIsCollecting(false);

      if (!candidatesRef.current.length) {
        setMessage("לא מצאתי פריים מספיק טוב — תנסה שוב");
        return;
      }

      const best = [...candidatesRef.current].sort((a, b) => b.score - a.score)[0];
      setCapturedImage(best.imageData);
      setScore(best.score);
      setBrightness(Math.round(best.brightness));
      setMessage(`בחרתי את הפריים הכי טוב שלך ✅ ציון: ${best.score}`);
    }, 4000);
  };

  const takePhoto = () => {
    const analysis = analyzeFrame();
    const imageData = captureCurrentFrame(analysis);

    if (!imageData) {
      setMessage("לא הצלחתי לצלם תמונה");
      return;
    }

    setCapturedImage(imageData);
    setScore(analysis.score);
    setBrightness(Math.round(analysis.brightness));
    setMessage(`התמונה צולמה ✅ ציון: ${analysis.score}`);
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
          width: 380,
          background: "white",
          borderRadius: 24,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10 }}>Best Angle App</h1>

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

        <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 20 }}>
          Score: {score}/100
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          תאורה: {brightness}
        </div>

        <p
          style={{
            minHeight: 30,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 14,
          }}
        >
          {message}
        </p>

        {isCollecting && (
          <div style={{ marginBottom: 12, color: "#2563eb", fontWeight: 700 }}>
            אוסף פריימים... {framesCollected}
          </div>
        )}

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
            onClick={startBestShot}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#7c3aed",
              color: "white",
              cursor: "pointer",
            }}
          >
            Best Shot
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

        <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        <canvas ref={sampleCanvasRef} style={{ display: "none" }} />

        {capturedImage && (
          <div style={{ marginTop: 16 }}>
            <h3>Best Result</h3>
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