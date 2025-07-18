const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup uploads folder
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config for file uploads (music files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use timestamp + original name to avoid collisions
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// In-memory data storage (replace with DB in production)
const users = [];
const lyricsStore = [];
const musicUploads = [];

// Helper to find user by email
function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

// ===== Routes =====

// Signup / Login (simplified: just registers if new, else returns user)
app.post("/api/login", (req, res) => {
  const { email, name, jobTitle } = req.body;
  if (!email || !name || !jobTitle) {
    return res.status(400).json({ error: "Missing fields" });
  }
  let user = findUserByEmail(email);
  if (!user) {
    user = { email, name, jobTitle, assignedArtists: [], id: users.length + 1 };
    users.push(user);
    return res.status(201).json({ message: "User registered", user });
  }
  return res.json({ message: "User logged in", user });
});

// Assign artists to producer (for demo)
app.post("/api/assign-artist", (req, res) => {
  const { producerEmail, artistEmail } = req.body;
  if (!producerEmail || !artistEmail) {
    return res.status(400).json({ error: "Missing producerEmail or artistEmail" });
  }
  const producer = findUserByEmail(producerEmail);
  const artist = findUserByEmail(artistEmail);
  if (!producer || !artist) {
    return res.status(404).json({ error: "Producer or artist not found" });
  }
  if (producer.jobTitle !== "Producer" || artist.jobTitle !== "Artist") {
    return res.status(400).json({ error: "Invalid roles" });
  }
  if (!producer.assignedArtists.includes(artistEmail)) {
    producer.assignedArtists.push(artistEmail);
  }
  return res.json({ message: "Artist assigned to producer", producer });
});

// Upload music endpoint
app.post("/api/upload-music", upload.single("music"), (req, res) => {
  const { uploaderEmail, artistEmail } = req.body;
  const file = req.file;

  if (!uploaderEmail || !file) {
    return res.status(400).json({ error: "Missing uploaderEmail or music file" });
  }

  const uploader = findUserByEmail(uploaderEmail);
  if (!uploader) return res.status(404).json({ error: "Uploader user not found" });

  // Logic: 
  // Producer can upload only for assigned artists
  // Artist can upload for themselves only if no producer assigned
  if (uploader.jobTitle === "Producer") {
    if (!artistEmail) {
      return res.status(400).json({ error: "Must specify artistEmail for producer uploads" });
    }
    if (!uploader.assignedArtists.includes(artistEmail)) {
      return res.status(403).json({ error: "Producer not assigned to this artist" });
    }
  } else if (uploader.jobTitle === "Artist") {
    if (artistEmail && artistEmail !== uploader.email) {
      return res.status(403).json({ error: "Artist can only upload their own music" });
    }
    // Check if artist has assigned producer (deny upload if producer assigned)
    const assignedProducer = users.find(
      (u) => u.jobTitle === "Producer" && u.assignedArtists.includes(uploader.email)
    );
    if (assignedProducer) {
      return res.status(403).json({ error: "Artist cannot upload because a producer is assigned" });
    }
  } else {
    return res.status(403).json({ error: "Only Producers and Artists can upload music" });
  }

  // Save upload record
  musicUploads.push({
    uploaderEmail,
    artistEmail: artistEmail || uploader.email,
    filename: file.filename,
    originalname: file.originalname,
    uploadDate: new Date(),
  });

  return res.json({ message: "Music uploaded successfully", file: file.filename });
});

// Submit lyrics
app.post("/api/submit-lyrics", (req, res) => {
  const { authorEmail, lyrics, artistEmail } = req.body;

  if (!authorEmail || !lyrics) {
    return res.status(400).json({ error: "Missing authorEmail or lyrics" });
  }

  const author = findUserByEmail(authorEmail);
  if (!author) return res.status(404).json({ error: "Author not found" });

  if (author.jobTitle === "Writer") {
    if (!artistEmail) {
      return res.status(400).json({ error: "Writer must specify artistEmail to send lyrics" });
    }
  }

  lyricsStore.push({
    authorEmail,
    artistEmail: artistEmail || authorEmail,
    lyrics,
    date: new Date(),
  });

  return res.json({ message: "Lyrics submitted successfully" });
});

// Simple analytics endpoint (dummy data)
app.get("/api/analytics/:email", (req, res) => {
  const email = req.params.email;
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Return dummy stats for demo
  return res.json({
    views: Math.floor(Math.random() * 10000),
    subscribers: Math.floor(Math.random() * 5000),
    musicCount: musicUploads.filter((m) => m.artistEmail === email).length,
    lyricsCount: lyricsStore.filter((l) => l.artistEmail === email).length,
  });
});

// Serve uploaded files statically
app.use("/uploads", express.static(uploadDir));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
